const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

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

    const payload = {
      notification: {
        title: urgent ? `🚨 URGENT: ${title}` : `📢 ${title}`,
        body: message,
      },
      data: {
        type: "announcement",
        teamCode: teamCode,
      },
      topic: `team_${teamCode}`,
    };

    const messageId = await admin.messaging().send(payload);
    console.log(`Sent announcement notification ${messageId} to topic team_${teamCode}`);
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

    const payload = {
      notification: {
        title: notifTitle,
        body: notifBody,
      },
      data: {
        type: "service",
        teamCode: teamCode,
      },
      topic: `team_${teamCode}`,
    };

    try {
      await admin.messaging().send(payload);
      console.log(`Successfully sent service notification to topic team_${teamCode}`);
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
    const data = snapshot.data();
    const teamCode = context.params.teamCode.toUpperCase();
    const requesterName = data.requesterName || "A teammate";
    const role = data.role || "";
    const serviceTitle = data.serviceTitle || "Worship Service";

    const payload = {
      notification: {
        title: "🔄 New Substitution Request",
        body: `${requesterName} requested coverage for ${role} in ${serviceTitle}.`,
      },
      data: {
        type: "substitution",
        teamCode: teamCode,
      },
      topic: `team_${teamCode}`,
    };

    try {
      await admin.messaging().send(payload);
      console.log(`Successfully sent substitution notification to topic team_${teamCode}`);
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
    const data = snapshot.data();
    const teamCode = context.params.teamCode.toUpperCase();
    const senderName = data.senderName || "Team Member";
    const text = data.text || "📷 Sent an image";

    const payload = {
      notification: {
        title: `💬 ${senderName}`,
        body: text,
      },
      data: {
        type: "chat",
        teamCode: teamCode,
      },
      topic: `team_${teamCode}`,
    };

    try {
      await admin.messaging().send(payload);
      console.log(`Successfully sent chat notification to topic team_${teamCode}`);
    } catch (error) {
      console.error("Error sending chat notification:", error);
    }
  });
