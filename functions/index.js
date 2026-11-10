const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

/**
 * Send a data-only push to registered browsers. Android continues to use its
 * team topic. Web messages are data-only so the service worker can display
 * exactly one notification while the page is closed.
 */
async function sendWebPushToTeam(teamCode, notification, excludedUids = []) {
  const code = String(teamCode || "").trim().toUpperCase();
  if (!code) return;

  const users = await db.collection("users").where("teamCode", "==", code).get();
  const excluded = new Set(excludedUids.filter(Boolean));
  const registrations = [];

  for (const userDoc of users.docs) {
    const profile = userDoc.data() || {};
    if (excluded.has(userDoc.id) || profile.notificationsEnabled === false || profile.teamUnmuted === false) continue;

    const tokenDocs = await userDoc.ref.collection("pushTokens").get();
    for (const tokenDoc of tokenDocs.docs) {
      const token = tokenDoc.get("token");
      if (tokenDoc.get("platform") === "web" && typeof token === "string" && token.length > 0) {
        registrations.push({ token, ref: tokenDoc.ref });
      }
    }
  }

  for (let offset = 0; offset < registrations.length; offset += 500) {
    const batch = registrations.slice(offset, offset + 500);
    const response = await admin.messaging().sendEachForMulticast({
      tokens: batch.map((registration) => registration.token),
      data: {
        type: String(notification.type || "team"),
        title: String(notification.title || "SyncedM update").slice(0, 120),
        body: String(notification.body || "").slice(0, 1000),
        teamCode: code,
        url: "https://synedn.web.app/",
      },
      webpush: { headers: { TTL: "3600" } },
    });

    const stale = [];
    response.responses.forEach((result, index) => {
      if (!result.success && [
        "messaging/registration-token-not-registered",
        "messaging/invalid-registration-token",
      ].includes(result.error?.code)) stale.push(batch[index].ref.delete());
    });
    await Promise.all(stale);
  }
}

async function sendTeamAndroidTopic(teamCode, notification, data = {}) {
  const code = String(teamCode || "").trim().toUpperCase();
  if (!code) return null;
  return admin.messaging().send({
    notification: {
      title: String(notification.title || "SyncedM update"),
      body: String(notification.body || ""),
    },
    data: { type: String(notification.type || "team"), teamCode: code, ...data },
    topic: `team_${code}`,
  });
}

/**
 * 1. Send push notification for new Announcements
 */
exports.onAnnouncementCreated = functions.firestore
  .document("teams/{teamCode}/announcements/{announcementId}")
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data() || {};
    const teamCode = String(context.params.teamCode || "").trim().toUpperCase();
    const urgent = data.urgent === true;
    const title = typeof data.title === "string" && data.title.trim()
      ? data.title.trim()
      : "Team Announcement";
    const message = typeof data.message === "string" ? data.message : "";

    const notification = {
      type: "announcement",
      title: urgent ? `🚨 URGENT: ${title}` : `📢 ${title}`,
      body: message,
    };
    const [messageId] = await Promise.all([
      sendTeamAndroidTopic(teamCode, notification),
      sendWebPushToTeam(teamCode, notification, [data.createdBy]),
    ]);
    console.log(`Sent announcement notification ${messageId} to team ${teamCode}`);
    return messageId;
  });

/**
 * 2. Send push notification when a Worship Service is published or updated
 */
exports.onServiceUpdated = functions.firestore
  .document("teams/{teamCode}/services/{id}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return null;

    const teamCode = context.params.teamCode.toUpperCase();
    const status = after.status || "";
    const title = after.title || "Worship Service";
    const date = after.date || "";
    const start = after.start || "";
    const venue = after.venue || "";

    if (status.toLowerCase() !== "published") return null;

    let notifTitle = "";
    let notifBody = `${date} (${start}) at ${venue}`;

    if (!before || (before.status || "").toLowerCase() !== "published") {
      notifTitle = `📅 New Service Scheduled: ${title}`;
    } else if (
      before.date !== date ||
      before.start !== start ||
      before.venue !== venue
    ) {
      notifTitle = `⚠️ Schedule Change: ${title}`;
    } else {
      return null;
    }

    try {
      const notification = { type: "service", title: notifTitle, body: notifBody };
      await Promise.all([
        sendTeamAndroidTopic(teamCode, notification),
        sendWebPushToTeam(teamCode, notification, [after.createdBy]),
      ]);
      console.log(`Successfully sent service notification to team ${teamCode}`);
    } catch (error) {
      console.error("Error sending service notification:", error);
    }
  });

/**
 * 3. Send push notification for Substitution Requests
 */
exports.onSubstitutionCreated = functions.firestore
  .document("teams/{teamCode}/substitutions/{id}")
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data() || {};
    const teamCode = context.params.teamCode.toUpperCase();
    const requesterName = data.requesterName || "A teammate";
    const role = data.role || "";
    const serviceTitle = data.serviceTitle || "Worship Service";

    try {
      const notification = {
        type: "substitution",
        title: "🔄 New Substitution Request",
        body: `${requesterName} requested coverage for ${role} in ${serviceTitle}.`,
      };
      await Promise.all([
        sendTeamAndroidTopic(teamCode, notification),
        sendWebPushToTeam(teamCode, notification, [data.requesterUid]),
      ]);
      console.log(`Successfully sent substitution notification to team ${teamCode}`);
    } catch (error) {
      console.error("Error sending substitution notification:", error);
    }
  });

/**
 * 4. Send push notification for Team Chat Messages
 */
exports.onChatMessageCreated = functions.firestore
  .document("teams/{teamCode}/messages/{id}")
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data() || {};
    const teamCode = context.params.teamCode.toUpperCase();
    const senderName = data.senderName || "Team Member";
    const text = data.text || "📷 Sent an image";

    try {
      const notification = { type: "chat", title: `💬 ${senderName}`, body: text };
      await Promise.all([
        sendTeamAndroidTopic(teamCode, notification),
        sendWebPushToTeam(teamCode, notification, [data.senderUid]),
      ]);
      console.log(`Successfully sent chat notification to team ${teamCode}`);
    } catch (error) {
      console.error("Error sending chat notification:", error);
    }
  });
