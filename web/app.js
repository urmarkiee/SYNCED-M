import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  where
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
const isIOSBrowser = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const state = {
  user: null,
  profile: null,
  team: null,
  teamCode: "",
  isLeader: false,
  view: "home",
  services: [],
  songs: [],
  announcements: [],
  members: [],
  messages: [],
  substitutions: [],
  reports: [],
  rejoinRequests: [],
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedServiceId: "",
  songTranspose: 0,
  chordScrollTimer: null,
  sheetScrollSpeed: 35,
  metronomeTimer: null,
  metronomeContext: null,
  notificationPrimed: new Set(),
  listeners: []
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const clean = (value = "") => String(value).trim();
const asDate = (value) => {
  if (!value) return null;
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const displayName = () => state.profile?.fullName || state.profile?.username || state.user?.displayName || state.user?.email?.split("@")[0] || "Worship team";
const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "SM";
const dateLabel = (dateValue, options = { month: "short", day: "numeric", year: "numeric" }) => {
  const date = asDate(dateValue);
  return date ? new Intl.DateTimeFormat(undefined, options).format(date) : "Date to be announced";
};
const timeLabel = (value = "") => {
  if (!value) return "Time to be announced";
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2020, 0, 1, hour, minute));
};
const serviceDate = (service) => service?.date ? new Date(`${service.date}T${service.start || "12:00"}:00`) : null;
const prettyError = (error) => {
  const code = error?.code || "";
  const messages = {
    "auth/email-already-in-use": "That email already has a SyncedM account. Try signing in.",
    "auth/invalid-credential": "The email or password doesn’t match. Try again.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
    "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups and try again.",
    "auth/unauthorized-domain": "This web address is not authorized yet. Add localhost under Firebase Authentication → Settings → Authorized domains.",
    "permission-denied": "Firebase blocked this action. Check your team access and Firestore rules.",
    "auth/network-request-failed": "Network connection failed. Check your internet and try again."
  };
  return messages[code] || error?.message || "Something went wrong. Please try again.";
};

async function uploadImageToCloudinary(file, maxDimension = 1200) {
  if (!(file instanceof File) || !file.size) return "";
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  let imageFile = file;
  if (window.createImageBitmap) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .86));
    if (blob) imageFile = new File([blob], "syncedm-image.jpg", { type: "image/jpeg" });
  }
  const data = new FormData();
  data.append("file", imageFile);
  data.append("upload_preset", "synced_preset");
  const response = await fetch("https://api.cloudinary.com/v1_1/ffb3fdkm/image/upload", { method: "POST", body: data });
  if (!response.ok) throw new Error("Image upload failed. Try another image or try again later.");
  const result = await response.json();
  if (!result.secure_url) throw new Error("The image service did not return a usable link.");
  return result.secure_url;
}

function toast(message, kind = "") {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast show ${kind}`.trim();
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = "toast"; }, 3200);
}

function setBusy(button, busy, label = "Working…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = label;
    button.disabled = true;
    button.classList.add("is-busy");
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
    button.classList.remove("is-busy");
    delete button.dataset.originalLabel;
  }
}

function setAuthMessage(message = "") {
  $("#auth-error").textContent = message;
}

function showAuth() {
  stopTeamListeners();
  $("#loading-screen").classList.add("is-hidden");
  $("#app-shell").classList.add("is-hidden");
  $("#onboarding-shell").classList.add("is-hidden");
  $("#auth-shell").classList.remove("is-hidden");
}

function showOnboarding() {
  stopTeamListeners();
  $("#loading-screen").classList.add("is-hidden");
  $("#auth-shell").classList.add("is-hidden");
  $("#app-shell").classList.add("is-hidden");
  $("#onboarding-shell").classList.remove("is-hidden");
  $("#rejoin-form")?.classList.add("is-hidden");
}

function stopTeamListeners() {
  state.listeners.forEach((unsubscribe) => unsubscribe());
  state.listeners = [];
  state.notificationPrimed.clear();
  state.teamCode = "";
  state.team = null;
  state.services = [];
  state.songs = [];
  state.announcements = [];
  state.members = [];
  state.messages = [];
  state.substitutions = [];
  state.reports = [];
  state.rejoinRequests = [];
}

async function createMissingProfile(user) {
  const profileRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(profileRef);
  if (snapshot.exists()) return snapshot.data();
  const firstName = clean(pendingNewUserName || user.displayName || user.email?.split("@")[0] || "Member");
  const profile = {
    uid: user.uid,
    username: firstName.slice(0, 50),
    email: user.email || "",
    role: "",
    teamName: "",
    teamCode: "",
    fullName: firstName.slice(0, 100),
    phone: "",
    country: "Philippines",
    language: "English",
    ministryRole: "",
    photoUri: (user.photoURL || "").slice(0, 500),
    unavailableRanges: [],
    removedByLeader: false,
    removedTeamCode: "",
    createdAt: Date.now()
  };
  await setDoc(profileRef, profile);
  return profile;
}

let pendingNewUserName = "";

async function initializeSignedInWorkspace(user) {
  stopTeamListeners();
  state.user = user;
  try {
    state.profile = await createMissingProfile(user);
    if (pendingNewUserName && !state.profile.fullName) {
      await updateDoc(doc(db, "users", user.uid), { fullName: pendingNewUserName.slice(0, 100), username: pendingNewUserName.slice(0, 50) });
      state.profile.fullName = pendingNewUserName;
      state.profile.username = pendingNewUserName;
    }
    pendingNewUserName = "";
    if (state.profile.removedByLeader) {
      showOnboarding();
      $("#onboarding-error").textContent = "Your previous team removed this account. You can ask its leader to restore your access.";
      $("#rejoin-form").classList.remove("is-hidden");
      $$("[data-onboarding]").forEach((button) => { button.disabled = true; });
      return;
    }
    const teamCode = clean(state.profile.teamCode).toUpperCase();
    if (!teamCode) {
      showOnboarding();
      return;
    }
    const teamSnapshot = await getDoc(doc(db, "teams", teamCode));
    if (!teamSnapshot.exists()) {
      await updateDoc(doc(db, "users", user.uid), { teamCode: "", teamName: "", role: "" });
      state.profile = { ...state.profile, teamCode: "", teamName: "", role: "" };
      showOnboarding();
      $("#onboarding-error").textContent = "That team is no longer available. Join another team or create a new one.";
      return;
    }
    state.teamCode = teamCode;
    state.team = teamSnapshot.data();
    state.isLeader = state.team.leaderUid === user.uid;
    $("#loading-screen").classList.add("is-hidden");
    $("#auth-shell").classList.add("is-hidden");
    $("#onboarding-shell").classList.add("is-hidden");
    $("#app-shell").classList.remove("is-hidden");
    updateIdentity();
    startTeamListeners();
    renderView();
  } catch (error) {
    console.error("Could not open SyncedM workspace", error);
    if (error?.code === "permission-denied") {
      $("#loading-screen").classList.add("is-hidden");
      $("#auth-shell").classList.add("is-hidden");
      $("#app-shell").classList.remove("is-hidden");
      $("#view-root").innerHTML = `<div class="panel empty-state"><strong>Can’t load your workspace</strong>${escapeHtml(prettyError(error))}</div>`;
      return;
    }
    setAuthMessage(prettyError(error));
    showAuth();
  }
}

function updateIdentity() {
  const name = displayName();
  const photo = state.profile?.photoUri || state.user?.photoURL || "";
  $("#team-name").textContent = state.team?.teamName || "Your team";
  const avatar = photo ? `<img src="${escapeHtml(photo)}" alt="" referrerpolicy="no-referrer">` : escapeHtml(initials(name));
  $("#profile-shortcut").innerHTML = avatar;
  $("#sidebar-user").innerHTML = `<div class="user-avatar">${avatar}</div><div class="sidebar-user-text"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(state.profile?.ministryRole || state.profile?.role || "Team member")}</span></div>`;
  $("#schedule-count").textContent = String(state.services.length);
  updateNotificationBadge();
}

function notifyNewFirestoreDocs(snapshot, feed, titleFor, bodyFor) {
  const first = !state.notificationPrimed.has(feed);
  state.notificationPrimed.add(feed);
  if (first || !("Notification" in window) || Notification.permission !== "granted" || state.profile?.notificationsEnabled === false || state.profile?.teamUnmuted === false) return;
  for (const change of snapshot.docChanges()) {
    if (change.type !== "added") continue;
    const data = change.doc.data();
    if (data.createdBy === state.user?.uid || data.senderUid === state.user?.uid || data.requesterUid === state.user?.uid) continue;
    try { new Notification(titleFor(data), { body: bodyFor(data), icon: "./assets/syncedm-mark.svg", tag: `${feed}-${change.doc.id}` }); }
    catch (error) { console.warn("Browser notification could not be shown", error); }
  }
}

function getNotificationItems() {
  return [
    ...state.services.filter((item) => item.status === "Published").map((item) => ({ id: `service-${item.id}`, title: "Service scheduled", text: `${item.title} · ${dateLabel(item.date, { month: "short", day: "numeric" })}`, time: Number(item.updatedAt || item.createdAt) || 0, icon: "▦" })),
    ...state.announcements.map((item) => ({ id: `announcement-${item.id}`, title: `${item.urgent ? "Urgent · " : ""}${item.title}`, text: item.message, time: Number(item.updatedAt || item.createdAt) || 0, icon: "•" })),
    ...state.substitutions.map((item) => ({ id: `sub-${item.id}`, title: `${item.type === "Inclusion" ? "Offer" : "Substitution"} · ${item.status}`, text: `${item.requesterName} · ${item.serviceTitle}`, time: Number(item.updatedAt || item.createdAt) || 0, icon: "⇄" }))
  ].sort((a, b) => b.time - a.time).slice(0, 50);
}

function updateNotificationBadge() {
  const badge = $("#notification-count");
  const button = $("#notifications-shortcut");
  if (!badge || !button) return;
  const hidden = new Set(JSON.parse(localStorage.getItem(`syncedm-dismissed-${state.user?.uid || ""}`) || "[]"));
  const count = getNotificationItems().filter((item) => !hidden.has(item.id)).length;
  badge.textContent = count > 9 ? "9+" : String(count);
  badge.classList.toggle("is-hidden", count === 0);
  button.setAttribute("aria-label", count ? `Notifications, ${count} updates` : "Notifications");
}

function startTeamListeners() {
  const code = state.teamCode;
  if (!code) return;
  const listen = (ref, next, errorLabel) => {
    const unsubscribe = onSnapshot(ref, (snapshot) => next(snapshot), (error) => {
      console.error(`${errorLabel} listener failed`, error);
      toast(prettyError(error), "error");
    });
    state.listeners.push(unsubscribe);
  };
  listen(collection(db, "teams", code, "services"), (snapshot) => {
    notifyNewFirestoreDocs(snapshot, "services", (item) => item.title || "New service", (item) => `${dateLabel(item.date, { month: "short", day: "numeric" })}${item.venue ? ` · ${item.venue}` : ""}`);
    state.services = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (serviceDate(a)?.getTime() || 0) - (serviceDate(b)?.getTime() || 0));
    updateIdentity();
    if (["home", "schedule", "calendar", "lineups", "notifications", "substitutions"].includes(state.view)) renderView();
  }, "Services");
  listen(collection(db, "teams", code, "songs"), (snapshot) => {
    state.songs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => String(a.title).localeCompare(String(b.title)));
    if (["home", "songs", "lineups"].includes(state.view)) renderView();
  }, "Songs");
  listen(collection(db, "teams", code, "announcements"), (snapshot) => {
    notifyNewFirestoreDocs(snapshot, "announcements", (item) => item.urgent ? `Urgent: ${item.title || "Team announcement"}` : item.title || "Team announcement", (item) => item.message || "A new update was posted.");
    state.announcements = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (asDate(b.createdAt)?.getTime() || 0) - (asDate(a.createdAt)?.getTime() || 0));
    updateNotificationBadge();
    if (["home", "team", "notifications"].includes(state.view)) renderView();
  }, "Announcements");
  listen(query(collection(db, "users"), where("teamCode", "==", code)), (snapshot) => {
    state.members = snapshot.docs.map((item) => ({ uid: item.id, ...item.data() })).sort((a, b) => (a.uid === state.team?.leaderUid ? -1 : b.uid === state.team?.leaderUid ? 1 : String(a.fullName || a.username).localeCompare(String(b.fullName || b.username))));
    if (["home", "team", "calendar", "roles", "substitutions"].includes(state.view)) renderView();
  }, "Team roster");
  listen(collection(db, "teams", code, "messages"), (snapshot) => {
    notifyNewFirestoreDocs(snapshot, "messages", (item) => item.senderName ? `Message from ${item.senderName}` : "New team message", (item) => item.text || "A photo was shared in team chat.");
    state.messages = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (asDate(a.timestamp)?.getTime() || Number(a.timestamp) || 0) - (asDate(b.timestamp)?.getTime() || Number(b.timestamp) || 0));
    if (state.view === "chat") renderView();
  }, "Team chat");
  listen(collection(db, "teams", code, "substitutions"), (snapshot) => {
    notifyNewFirestoreDocs(snapshot, "substitutions", (item) => item.type === "Inclusion" ? "New volunteer offer" : "Substitution request", (item) => `${item.requesterName || "A teammate"} · ${item.serviceTitle || "Service"}`);
    state.substitutions = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (asDate(b.createdAt)?.getTime() || Number(b.createdAt) || 0) - (asDate(a.createdAt)?.getTime() || Number(a.createdAt) || 0));
    updateNotificationBadge();
    if (["substitutions", "notifications"].includes(state.view)) renderView();
  }, "Substitution requests");
  if (state.isLeader) {
    listen(collection(db, "teams", code, "reports"), (snapshot) => {
      state.reports = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
      if (state.view === "reports") renderView();
    }, "Team reports");
    listen(query(collection(db, "teams", code, "rejoin_requests"), where("status", "==", "Pending")), (snapshot) => {
      state.rejoinRequests = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
      if (state.view === "requests" || state.view === "more") renderView();
    }, "Member rejoin requests");
  }
}

function goTo(view) {
  state.view = view;
  const primaryView = view === "lineups" ? "schedule" : ["calendar", "availability", "substitutions", "notifications", "reports", "roles", "requests", "profile"].includes(view) ? "more" : view;
  $$(".nav-link[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === primaryView));
  renderView();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setPage(title, description, kicker = "YOUR WORSHIP TEAM", actions = "") {
  $("#page-title").textContent = title;
  $("#page-description").textContent = description;
  $("#page-kicker").textContent = kicker;
  $("#topbar-current").textContent = title;
  $("#page-actions").innerHTML = actions;
}

function getUpcomingService() {
  const now = Date.now();
  return visibleServices().find((service) => serviceDate(service)?.getTime() >= now) || null;
}

function visibleServices() {
  return state.services.filter((service) => state.isLeader || service.status !== "Draft");
}

function renderServiceRow(service, options = {}) {
  const date = serviceDate(service);
  const dateDay = date ? new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(date) : "—";
  const dateMonth = date ? new Intl.DateTimeFormat(undefined, { month: "short" }).format(date) : "TBD";
  const songCount = Array.isArray(service.songs) ? service.songs.length : 0;
  const meta = [dateLabel(service.date, { weekday: "short", month: "short", day: "numeric" }), service.start ? timeLabel(service.start) : "Time to be announced", service.venue].filter(Boolean).join(" · ");
  const status = `<span class="item-pill ${service.status === "Published" ? "published" : "draft"}">${escapeHtml(service.status || "Draft")}</span>`;
  const deleteButton = options.canDelete ? `<button class="icon-button" data-action="delete-service" data-id="${escapeHtml(service.id)}" aria-label="Delete ${escapeHtml(service.title)}">×</button>` : "";
  return `<article class="service-row" data-action="open-service" data-id="${escapeHtml(service.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(service.title || "service")}"><div class="date-badge"><strong>${escapeHtml(dateDay)}</strong><span>${escapeHtml(dateMonth)}</span></div><div class="item-main"><strong>${escapeHtml(service.title || "Worship service")}</strong><span>${escapeHtml(meta)}${songCount ? ` · ${songCount} song${songCount === 1 ? "" : "s"}` : ""}</span></div>${status}${deleteButton}</article>`;
}

function renderSongRow(song) {
  return `<button class="song-row" type="button" data-action="open-song" data-id="${escapeHtml(song.id)}"><span class="song-symbol">♫</span><span class="item-main"><strong>${escapeHtml(song.title || "Untitled song")}</strong><span>${escapeHtml(song.artist || "Team arrangement")}</span></span><span class="item-pill key">Key ${escapeHtml(song.key || "C")}</span></button>`;
}

function renderAnnouncement(announcement) {
  const when = dateLabel(announcement.createdAt, { month: "short", day: "numeric" });
  return `<article class="announcement-row ${announcement.urgent ? "urgent" : ""}"><span class="announcement-mark">${announcement.urgent ? "!" : "•"}</span><div class="item-main"><strong>${escapeHtml(announcement.title || "Announcement")}</strong><p>${escapeHtml(announcement.message || "")}</p><span>${escapeHtml(announcement.author || "Team leader")} · ${escapeHtml(when)}</span></div>${state.isLeader ? `<div class="row-actions"><button class="icon-button" data-action="edit-announcement" data-id="${escapeHtml(announcement.id)}" aria-label="Edit announcement" type="button">✎</button><button class="icon-button" data-action="delete-announcement" data-id="${escapeHtml(announcement.id)}" aria-label="Delete announcement" type="button">×</button></div>` : ""}</article>`;
}

function renderMember(member) {
  const name = member.fullName || member.username || "Team member";
  const photo = member.photoUri ? `<img src="${escapeHtml(member.photoUri)}" alt="" referrerpolicy="no-referrer">` : escapeHtml(initials(name));
  const role = member.ministryRole || member.role || "Member";
  const isLeader = member.uid === state.team?.leaderUid;
  return `<article class="member-row"><span class="user-avatar">${photo}</span><span class="item-main"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(role)}</span></span><span class="badge ${isLeader ? "leader" : ""}">${isLeader ? "Leader" : "Member"}</span>${state.isLeader && !isLeader ? `<button class="icon-button" data-action="edit-member-role" data-id="${escapeHtml(member.uid)}" aria-label="Edit ministry role for ${escapeHtml(name)}" type="button">✎</button><button class="icon-button" data-action="remove-member" data-id="${escapeHtml(member.uid)}" aria-label="Remove ${escapeHtml(name)} from team" type="button">×</button>` : ""}</article>`;
}

function renderHome() {
  const name = displayName().split(/\s+/)[0];
  const next = getUpcomingService();
  const hero = next ? `<section class="hero-card"><p class="eyebrow">UP NEXT · ${escapeHtml(dateLabel(next.date, { weekday: "long" }).toUpperCase())}</p><h2>${escapeHtml(next.title || "Worship service")}</h2><p>${escapeHtml(next.venue || state.team?.teamName || "Your worship team")}</p><div class="hero-meta"><span>▦ ${escapeHtml(dateLabel(next.date, { month: "short", day: "numeric" }))}</span><span>◷ ${escapeHtml(next.start ? timeLabel(next.start) : "Time TBD")}</span><span>♫ ${(next.songs || []).length} songs</span></div><button class="button hero-link" data-view="schedule" type="button">View schedule&nbsp; →</button></section>` : `<section class="hero-card empty-hero"><p class="eyebrow">A NEW WEEK, A FRESH START</p><h2>Make room for what matters.</h2><p>Keep your team in sync with the next worship plan.</p>${state.isLeader ? `<button class="button hero-link" data-action="add-service" type="button">Plan a service&nbsp; +</button>` : ""}</section>`;
  const upcoming = visibleServices().filter((item) => serviceDate(item)?.getTime() >= Date.now()).slice(0, 3);
  const announcements = state.announcements.slice(0, 3);
  const memberFaces = state.members.slice(0, 5).map((member) => `<span class="mini-avatar" title="${escapeHtml(member.fullName || member.username || "Member")}">${escapeHtml(initials(member.fullName || member.username || "M"))}</span>`).join("");
  setPage(`Good to see you, ${name}`, "Here’s what’s happening with your team.", dateLabel(new Date(), { weekday: "long", month: "long", day: "numeric" }).toUpperCase());
  $("#view-root").innerHTML = `<div class="dashboard-grid">${hero}<div class="stat-stack"><article class="stat-card"><span class="stat-icon">▦</span><span class="stat-copy"><small>Upcoming services</small><strong>${upcoming.length}</strong></span></article><article class="stat-card"><span class="stat-icon cyan">♫</span><span class="stat-copy"><small>Team songs</small><strong>${state.songs.length}</strong></span></article><article class="stat-card"><span class="stat-icon green">♧</span><span class="stat-copy"><small>Team members</small><strong>${state.members.length}</strong></span>${memberFaces ? `<span class="member-stack">${memberFaces}</span>` : ""}</article></div></div><div class="content-grid"><section class="panel"><div class="panel-heading"><h2>Coming up</h2><button class="link-button" data-view="schedule" type="button">All services&nbsp; →</button></div><div class="service-list">${upcoming.length ? upcoming.map((item) => renderServiceRow(item)).join("") : `<div class="empty-state"><strong>No services scheduled yet</strong>${state.isLeader ? "Plan your next service to get everyone ready." : "Your leader’s upcoming services will appear here."}</div>`}</div></section><section class="panel"><div class="panel-heading"><h2>Team updates</h2><button class="link-button" data-view="team" type="button">View team&nbsp; →</button></div><div class="item-list">${announcements.length ? announcements.map(renderAnnouncement).join("") : `<div class="empty-state"><strong>All caught up</strong>Team announcements will show up here.</div>`}</div></section></div>`;
}

function renderSchedule() {
  const actions = `<button class="button button-quiet" data-view="calendar" type="button">Calendar</button><button class="button button-quiet" data-view="lineups" type="button">View lineups</button><button class="button button-quiet" data-view="availability" type="button">Availability</button>${state.isLeader ? `<button class="button button-primary" data-action="add-service" type="button">＋ New service</button>` : ""}`;
  setPage("Schedule", "Plan services and keep the whole team prepared.", state.team?.teamName?.toUpperCase() || "YOUR TEAM", actions);
  const upcoming = visibleServices().filter((item) => serviceDate(item)?.getTime() >= Date.now());
  const past = visibleServices().filter((item) => !serviceDate(item) || serviceDate(item).getTime() < Date.now());
  $("#view-root").innerHTML = `<div class="section-banner"><div><strong>Your next worship gathering</strong><p>${upcoming[0] ? `${escapeHtml(upcoming[0].title)} · ${escapeHtml(dateLabel(upcoming[0].date))}` : "Share a plan with your team to get started."}</p></div>${state.isLeader ? `<button class="button button-quiet" data-action="add-service" type="button">Create service</button>` : ""}</div><div class="page-columns"><section class="panel"><div class="panel-heading"><h2>Upcoming services</h2><span class="badge">${upcoming.length}</span></div><div class="service-list">${upcoming.length ? upcoming.map((item) => renderServiceRow(item, { canDelete: state.isLeader })).join("") : `<div class="empty-state"><strong>Nothing on the calendar yet</strong>When a service is scheduled, it will appear here.</div>`}</div></section><section class="panel"><div class="panel-heading"><h2>Recently completed</h2></div><div class="service-list">${past.length ? [...past].reverse().slice(0, 6).map((item) => renderServiceRow(item)).join("") : `<div class="empty-state">Completed services will be kept here.</div>`}</div></section></div>`;
}

function renderSongs() {
  const actions = state.isLeader ? `<button class="button button-primary" data-action="add-song" type="button">＋ Add song</button>` : "";
  setPage("Songs", "Your team’s shared worship library.", "SONG LIBRARY", actions);
  const songs = state.songs;
  $("#view-root").innerHTML = `<div class="page-columns"><section class="panel"><div class="filter-bar"><input class="search-field" id="song-search" type="search" placeholder="Search songs or artists" aria-label="Search songs" /><span class="badge">${songs.length} songs</span></div><div class="item-list" id="song-list">${songs.length ? songs.map(renderSongRow).join("") : `<div class="empty-state"><strong>Your song library is ready</strong>${state.isLeader ? "Add your first song to start building the setlist." : "Songs added by your leader will appear here."}</div>`}</div></section><aside class="panel"><div class="panel-heading"><h2>About the library</h2></div><p class="muted" style="line-height:1.65;margin:0">Songs are shared with everyone on ${escapeHtml(state.team?.teamName || "your team")}. Open a song to view the key, tempo, chord sheet, lyrics, and reference link.</p><div class="stat-card" style="margin-top:18px"><span class="stat-icon">♫</span><span class="stat-copy"><small>Total arrangements</small><strong>${songs.length}</strong></span></div></aside></div>`;
  $("#song-search")?.addEventListener("input", (event) => {
    const term = clean(event.target.value).toLowerCase();
    const filtered = state.songs.filter((song) => `${song.title || ""} ${song.artist || ""} ${song.key || ""}`.toLowerCase().includes(term));
    $("#song-list").innerHTML = filtered.length ? filtered.map(renderSongRow).join("") : `<div class="empty-state"><strong>No matching songs</strong>Try a different title or artist.</div>`;
  });
}

function renderTeam() {
  const actions = state.isLeader ? `<button class="button button-primary" data-action="add-announcement" type="button">＋ Announcement</button>` : "";
  setPage("Team", "The people and updates that keep your ministry connected.", "YOUR PEOPLE", actions);
  const invite = state.teamCode ? `<div><strong>Team invite code</strong><p>${escapeHtml(state.teamCode)} · Share this with your team</p></div><button class="button button-quiet" data-action="copy-code" type="button">Copy code</button>` : "";
  $("#view-root").innerHTML = `<div class="section-banner">${invite || `<div><strong>${escapeHtml(state.team?.teamName || "Your team")}</strong><p>Worship planning, together.</p></div>`}</div><div class="tool-tabs"><button class="tool-tab active" data-view="team" type="button">Members & updates</button><button class="tool-tab" data-view="chat" type="button">Team chat</button><button class="tool-tab" data-view="substitutions" type="button">Substitutions</button></div><div class="page-columns"><section class="panel"><div class="panel-heading"><h2>Members</h2><span class="badge">${state.members.length}</span></div><div class="item-list">${state.members.length ? state.members.map(renderMember).join("") : `<div class="empty-state"><strong>Your roster is empty</strong>Team members who join will appear here.</div>`}</div></section><section class="panel"><div class="panel-heading"><h2>Announcements</h2>${state.isLeader ? `<button class="link-button" data-action="add-announcement" type="button">Post new</button>` : ""}</div><div class="item-list">${state.announcements.length ? state.announcements.map(renderAnnouncement).join("") : `<div class="empty-state"><strong>Quiet for now</strong>Updates from your team leader will appear here.</div>`}</div></section></div>`;
}

function renderMore() {
  setPage("More tools", "Calendar, communication, and worship planning tools.", "TEAM TOOLS");
  const tools = [["calendar", "▦", "Calendar", "Services and team availability"], ["availability", "◷", "Availability", "Share the dates you cannot serve"], ["lineups", "♫", "Service lineups", "View setlists, keys, and assigned roles"], ["substitutions", "⇄", "Substitutions", "Request or offer service cover"], ["notifications", "◉", "Notifications", "Recent services and team updates"], ["reports", "⚑", "Team reports", state.isLeader ? `${state.reports.length} reports from members` : "Send a private note to your leader"], ["roles", "♧", "Team roles", "View the ministry role list"], ...(state.isLeader ? [["requests", "↺", "Rejoin requests", `${state.rejoinRequests.length} waiting for review`]] : []), ["profile", "◎", "Profile & settings", "Update your contact details"]];
  $("#view-root").innerHTML = `<div class="tool-grid">${tools.map(([view, icon, title, description]) => `<button class="tool-card" data-view="${view}" type="button"><span class="tool-card-icon">${icon}</span><span><strong>${title}</strong><small>${description}</small></span><span class="tool-arrow">›</span></button>`).join("")}</div>`;
}

function renderCalendar() {
  const month = state.calendarMonth;
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => {
    const day = i - offset + 1;
    if (day < 1 || day > count) return `<div class="calendar-cell outside"></div>`;
    const date = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const service = visibleServices().filter((item) => item.date === date);
    const today = new Date().toDateString() === new Date(month.getFullYear(), month.getMonth(), day).toDateString();
    return `<div class="calendar-cell ${today ? "today" : ""}"><strong>${day}</strong>${service.slice(0, 2).map((item) => `<button class="calendar-event" data-action="open-service" data-id="${escapeHtml(item.id)}" type="button">${escapeHtml(item.title || "Service")}</button>`).join("")}${service.length > 2 ? `<small>+${service.length - 2}</small>` : ""}</div>`;
  }).join("");
  setPage("Calendar", "Services and shared availability at a glance.", state.team?.teamName?.toUpperCase() || "YOUR TEAM", `<button class="button button-quiet" data-view="availability" type="button">Set availability</button>${state.isLeader ? `<button class="button button-primary" data-action="add-service" type="button">＋ New service</button>` : ""}`);
  const unavailable = state.members.flatMap((member) => (Array.isArray(member.unavailableRanges) ? member.unavailableRanges : []).map((range) => `<div class="availability-row"><strong>${escapeHtml(member.fullName || member.username || "Member")}</strong><span>${escapeHtml(dateLabel(range.startDate, { month: "short", day: "numeric" }))} – ${escapeHtml(dateLabel(range.endDate, { month: "short", day: "numeric" }))}${range.reason ? ` · ${escapeHtml(range.reason)}` : ""}</span></div>`)).slice(0, 8).join("");
  $("#view-root").innerHTML = `<div class="panel calendar-panel"><div class="calendar-heading"><button class="icon-button" data-action="calendar-prev" aria-label="Previous month" type="button">‹</button><h2>${escapeHtml(new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month))}</h2><button class="icon-button" data-action="calendar-next" aria-label="Next month" type="button">›</button></div><div class="calendar-grid calendar-weekdays">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<span>${d}</span>`).join("")}</div><div class="calendar-grid">${cells}</div></div><div class="page-columns calendar-lower"><section class="panel"><div class="panel-heading"><h2>Team availability</h2><button class="link-button" data-view="availability" type="button">Update yours</button></div><div class="item-list">${unavailable || `<div class="empty-state">No unavailable dates have been shared yet.</div>`}</div></section><section class="panel"><div class="panel-heading"><h2>Upcoming services</h2><span class="badge">${visibleServices().filter((item) => serviceDate(item)?.getTime() >= Date.now()).length}</span></div><div class="service-list">${visibleServices().filter((item) => serviceDate(item)?.getTime() >= Date.now()).slice(0, 4).map((item) => renderServiceRow(item)).join("") || `<div class="empty-state">No upcoming services.</div>`}</div></section></div>`;
}

function renderLineups() {
  const services = visibleServices().filter((item) => Array.isArray(item.songs) && item.songs.length).sort((a, b) => (serviceDate(a)?.getTime() || 0) - (serviceDate(b)?.getTime() || 0));
  const service = services.find((item) => item.id === state.selectedServiceId);
  if (!service) {
    setPage("Service lineups", "View the songs, keys, and assignments planned for each service.", "WORSHIP PLANNING", `<button class="button button-quiet" data-view="schedule" type="button">Schedule</button>`);
    $("#view-root").innerHTML = `<section class="panel"><div class="panel-heading"><h2>Choose a service</h2><span class="badge">${services.length} lineups</span></div><div class="item-list">${services.map((item) => `<button class="lineup-service" data-action="open-lineup" data-id="${escapeHtml(item.id)}" type="button"><span class="date-badge"><strong>${escapeHtml(dateLabel(item.date, { day: "numeric" }))}</strong><span>${escapeHtml(dateLabel(item.date, { month: "short" }))}</span></span><span><strong>${escapeHtml(item.title || "Worship service")}</strong><small>${escapeHtml(dateLabel(item.date, { weekday: "long", month: "short", day: "numeric" }))} · ${(item.songs || []).length} songs · ${escapeHtml(item.status || "Published")}</small></span><span class="tool-arrow">›</span></button>`).join("") || `<div class="empty-state"><strong>No setlists yet</strong>When a leader adds songs to a service plan, the lineup will show here.</div>`}</div></section>`;
    return;
  }
  const songs = (service.songs || []).map((item, index) => {
    const title = typeof item === "string" ? item : item.title || "Song";
    const catalogSong = state.songs.find((song) => (item.id && song.id === item.id) || song.title?.toLowerCase() === title.toLowerCase());
    const key = typeof item === "string" ? catalogSong?.key || "" : item.key || catalogSong?.key || "";
    const artist = typeof item === "string" ? catalogSong?.artist || "" : item.artist || catalogSong?.artist || "";
    const bpm = typeof item === "string" ? catalogSong?.bpm || "" : item.bpm || catalogSong?.bpm || "";
    const songActionLabel = songDisplayMode() === "lyrics" ? "View lyrics" : catalogSong?.sheet?.trim() ? "View chord sheet" : "Song details";
    return `<article class="lineup-song"><span class="lineup-number">${index + 1}</span><span class="lineup-song-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml([artist, bpm ? `${bpm} BPM` : ""].filter(Boolean).join(" · ") || "Team arrangement")}</small></span>${key ? `<span class="item-pill key">Key ${escapeHtml(key)}</span>` : ""}${catalogSong ? `<button class="button button-quiet lineup-chart-button" data-action="open-song" data-id="${escapeHtml(catalogSong.id)}" type="button">${songActionLabel}</button>` : `<span class="lineup-no-chart">Not in shared song library</span>`}</article>`;
  }).join("");
  const assignments = service.assignments || [];
  setPage(service.title || "Service lineup", `${dateLabel(service.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · ${service.start ? timeLabel(service.start) : "Time TBD"} · ${service.venue || "Location to be announced"}`, "SERVICE LINEUP", `<button class="button button-quiet" data-action="back-lineups" type="button">All lineups</button>${state.isLeader ? `<button class="button button-primary" data-action="edit-service" data-id="${escapeHtml(service.id)}" type="button">Edit plan</button>` : ""}`);
  $("#view-root").innerHTML = `<div class="page-columns"><section class="panel"><div class="panel-heading"><h2>Setlist</h2><span class="badge">${(service.songs || []).length} songs</span></div><div class="item-list">${songs}</div></section><aside class="panel"><div class="panel-heading"><h2>Team assignments</h2></div><div class="item-list">${assignments.map((item) => `<div class="availability-row"><span><strong>${escapeHtml(item.role || "Team role")}</strong><small>${escapeHtml(item.name || "To be assigned")}</small></span></div>`).join("") || `<div class="empty-state">No assignments posted yet.</div>`}<div class="lineup-rehearsal"><strong>Rehearsal</strong><p>${service.rehearsal?.date ? `${escapeHtml(dateLabel(service.rehearsal.date, { weekday: "long", month: "short", day: "numeric" }))}${service.rehearsal.start ? ` · ${escapeHtml(timeLabel(service.rehearsal.start))}` : ""}${service.rehearsal.venue ? ` · ${escapeHtml(service.rehearsal.venue)}` : ""}` : "No rehearsal scheduled."}</p>${service.rehearsal?.notes ? `<small>${escapeHtml(service.rehearsal.notes)}</small>` : ""}</div></div></aside></div>`;
}

function renderAvailability() {
  const ranges = Array.isArray(state.profile?.unavailableRanges) ? state.profile.unavailableRanges : [];
  setPage("Availability", "Tell your leader when you are unable to serve.", "YOUR SCHEDULE", `<button class="button button-quiet" data-view="calendar" type="button">View calendar</button>`);
  $("#view-root").innerHTML = `<div class="page-columns"><section class="panel"><div class="panel-heading"><h2>Add unavailable dates</h2></div><form class="auth-form" id="availability-form"><label>From<input name="startDate" type="date" required></label><label>Through<input name="endDate" type="date" required></label><label>Note (optional)<input name="reason" maxlength="120" placeholder="Travel, work, family commitment"></label><button class="button button-primary" type="submit">Share dates</button><p class="form-hint muted">Your team can see these dates.</p></form></section><section class="panel"><div class="panel-heading"><h2>Your unavailable dates</h2><span class="badge">${ranges.length}</span></div><div class="item-list">${ranges.map((range) => `<div class="availability-row"><span><strong>${escapeHtml(dateLabel(range.startDate, { month: "short", day: "numeric", year: "numeric" }))} – ${escapeHtml(dateLabel(range.endDate, { month: "short", day: "numeric", year: "numeric" }))}</strong><small>${escapeHtml(range.reason || "Unavailable")}</small></span><button class="icon-button" data-action="remove-availability" data-id="${escapeHtml(range.id)}" aria-label="Remove dates" type="button">×</button></div>`).join("") || `<div class="empty-state">You have not shared any unavailable dates.</div>`}</div></section></div>`;
  $("#availability-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const startDate = clean(form.get("startDate")); const endDate = clean(form.get("endDate"));
    if (endDate < startDate) return toast("The end date must be on or after the start date.", "error");
    const next = [...ranges, { id: crypto.randomUUID(), startDate, endDate, reason: clean(form.get("reason")).slice(0, 120), createdAt: Date.now() }];
    try { await updateDoc(doc(db, "users", state.user.uid), { unavailableRanges: next }); state.profile = { ...state.profile, unavailableRanges: next }; renderView(); toast("Availability shared with your team.", "success"); }
    catch (error) { toast(prettyError(error), "error"); }
  });
}

function renderChat() {
  setPage("Team chat", "A shared conversation for your worship team.", state.team?.teamName?.toUpperCase() || "TEAM CHAT");
  $("#view-root").innerHTML = `<section class="panel chat-panel"><div class="chat-messages">${state.messages.map((message) => { const media = /^https:\/\//i.test(message.mediaUrl || "") ? `<a class="chat-media-link" href="${escapeHtml(message.mediaUrl)}" target="_blank" rel="noopener noreferrer"><img class="chat-media" src="${escapeHtml(message.mediaUrl)}" alt="Image shared by ${escapeHtml(message.senderName || "team member")}" loading="lazy"></a>` : ""; return `<article class="chat-message ${message.senderUid === state.user.uid ? "mine" : ""}"><div class="chat-message-head"><strong>${escapeHtml(message.senderName || "Team member")}</strong><span>${escapeHtml(dateLabel(message.timestamp, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}${message.isEdited ? " · edited" : ""}</span></div>${message.text ? `<p>${escapeHtml(message.text)}</p>` : ""}${media}${message.senderUid === state.user.uid || state.isLeader ? `<div class="chat-actions">${message.senderUid === state.user.uid ? `<button class="link-button" data-action="edit-message" data-id="${escapeHtml(message.id)}" type="button">Edit</button>` : ""}<button class="link-button" data-action="delete-message" data-id="${escapeHtml(message.id)}" type="button">Delete</button></div>` : ""}</article>`; }).join("") || `<div class="empty-state"><strong>Start the conversation</strong>Send your team a message or share a photo.</div>`}</div><form class="chat-compose" id="chat-form"><input name="text" maxlength="2000" placeholder="Write a message to your team…" aria-label="Message"><label class="chat-attach-label" title="Attach a photo">＋<input name="photo" type="file" accept="image/*" aria-label="Attach photo"></label><button class="button button-primary" type="submit">Send</button></form></section>`;
  $("#chat-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const text = clean(form.get("text")).slice(0, 2000); const photo = form.get("photo"); const hasPhoto = photo instanceof File && photo.size > 0; if (!text && !hasPhoto) return;
    const button = $("button[type=submit]", event.currentTarget); setBusy(button, true, "Sending…");
    const ref = doc(collection(db, "teams", state.teamCode, "messages"));
    try { const mediaUrl = hasPhoto ? await uploadImageToCloudinary(photo, 1200) : ""; await setDoc(ref, { id: ref.id, teamCode: state.teamCode, senderUid: state.user.uid, senderName: displayName().slice(0, 100), senderRole: state.profile?.ministryRole || state.profile?.role || "Member", senderPhotoUri: state.profile?.photoUri || "", text, mediaUrl, timestamp: Date.now(), isEdited: false, editedAt: 0 }); event.currentTarget.reset(); }
    catch (error) { toast(error?.code ? prettyError(error) : error.message || "Message could not be sent.", "error"); }
    finally { setBusy(button, false); }
  });
}

function renderSubstitutions() {
  const list = state.substitutions.filter((item) => item.status !== "Cancelled");
  setPage("Substitutions", "Coordinate a service cover or volunteer to step in.", "TEAM SCHEDULE", `<button class="button button-primary" data-action="request-substitution" type="button">＋ New request</button>`);
  $("#view-root").innerHTML = `<section class="panel"><div class="panel-heading"><h2>Requests for your team</h2><span class="badge">${list.length}</span></div><div class="item-list">${list.map((item) => `<article class="substitution-card"><div class="substitution-card-main"><strong>${escapeHtml(item.type === "Inclusion" ? "Offer to help" : item.role || "Cover request")}</strong><span>${escapeHtml(item.serviceTitle || "Service")} · ${escapeHtml(dateLabel(item.serviceDate, { month: "short", day: "numeric", year: "numeric" }))}</span><small>${escapeHtml(item.requesterName || "Member")} → ${escapeHtml(item.substituteName || "Team")}${item.reason ? ` · ${escapeHtml(item.reason)}` : ""}</small></div><span class="item-pill ${["Approved", "Accepted"].includes(item.status) ? "published" : ""}">${escapeHtml(item.status || "Pending")}</span><div class="sub-actions">${item.status === "Pending" && item.substituteUid === state.user.uid ? `<button class="link-button" data-action="substitution-status" data-status="Substitute Accepted" data-id="${escapeHtml(item.id)}" type="button">Accept</button><button class="link-button" data-action="substitution-status" data-status="Declined" data-id="${escapeHtml(item.id)}" type="button">Decline</button>` : ""}${state.isLeader && item.status === "Substitute Accepted" ? `<button class="link-button" data-action="substitution-status" data-status="Approved" data-id="${escapeHtml(item.id)}" type="button">Approve</button>` : ""}${item.status === "Pending" && item.requesterUid === state.user.uid ? `<button class="link-button" data-action="substitution-status" data-status="Cancelled" data-id="${escapeHtml(item.id)}" type="button">Cancel</button>` : ""}</div></article>`).join("") || `<div class="empty-state"><strong>No requests yet</strong>Substitution requests will appear here.</div>`}</div></section>`;
}

function renderNotifications() {
  const hidden = new Set(JSON.parse(localStorage.getItem(`syncedm-dismissed-${state.user.uid}`) || "[]"));
  const items = getNotificationItems().filter((item) => !hidden.has(item.id));
  const browserAlerts = !("Notification" in window) ? "" : Notification.permission === "granted" ? `<span class="badge">Browser alerts on</span>` : `<button class="button button-quiet" data-action="enable-browser-alerts" type="button">Enable browser alerts</button>`;
  setPage("Notifications", "Recent services, announcements, and cover requests.", "TEAM UPDATES", `${browserAlerts}<button class="button button-quiet" data-action="clear-notifications" type="button">Clear list</button>`);
  $("#view-root").innerHTML = `<section class="panel"><div class="item-list">${items.map((item) => `<article class="notification-row"><span class="tool-card-icon">${item.icon}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text)}</small><small>${escapeHtml(item.time ? dateLabel(item.time, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Recently")}</small></span><button class="icon-button" data-action="dismiss-notification" data-id="${escapeHtml(item.id)}" aria-label="Dismiss update" type="button">×</button></article>`).join("") || `<div class="empty-state"><strong>You’re all caught up</strong>New team updates will show up here.</div>`}</div></section>`;
}

function renderReports() {
  setPage("Team reports", state.isLeader ? "Review concerns sent by your team." : "Send a private report to your team leader.", "TEAM CARE");
  $("#view-root").innerHTML = state.isLeader ? `<section class="panel"><div class="panel-heading"><h2>Member reports</h2><span class="badge">${state.reports.length}</span></div><div class="item-list">${state.reports.map((item) => `<article class="announcement-row"><div class="item-main"><strong>${escapeHtml(item.reporterName || "Team member")}</strong><p>${escapeHtml(item.reason || "")}</p><span>${escapeHtml(dateLabel(item.createdAt, { month: "short", day: "numeric", year: "numeric" }))}</span></div><button class="icon-button" data-action="delete-report" data-id="${escapeHtml(item.id)}" aria-label="Delete report" type="button">×</button></article>`).join("") || `<div class="empty-state">There are no reports to review.</div>`}</div></section>` : `<section class="panel"><div class="panel-heading"><h2>Contact your team leader</h2></div><form class="auth-form" id="report-form"><label>What would you like the leader to know?<textarea name="reason" maxlength="1000" required placeholder="Describe the concern or support you need…"></textarea></label><button class="button button-primary" type="submit">Send private report</button><p class="form-hint muted">Only your team leader can read this report.</p></form></section>`;
  $("#report-form")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const reason = clean(new FormData(event.currentTarget).get("reason")).slice(0, 1000); const ref = doc(collection(db, "teams", state.teamCode, "reports"));
    try { await setDoc(ref, { id: ref.id, teamCode: state.teamCode, reporterUid: state.user.uid, reporterName: displayName().slice(0, 100), reason, createdAt: Date.now() }); event.currentTarget.reset(); toast("Your private report was sent.", "success"); }
    catch (error) { toast(prettyError(error), "error"); }
  });
}

function renderRoles() {
  const roles = Array.isArray(state.team?.roles) ? state.team.roles : [];
  setPage("Team roles", "Keep ministry roles clear for planning and assignments.", "YOUR TEAM");
  $("#view-root").innerHTML = `<div class="page-columns"><section class="panel"><div class="panel-heading"><h2>Available roles</h2><span class="badge">${roles.length}</span></div><div class="role-list">${roles.map((role) => `<div class="availability-row"><strong>${escapeHtml(role)}</strong>${state.isLeader ? `<button class="icon-button" data-action="remove-role" data-role="${escapeHtml(role)}" aria-label="Remove role" type="button">×</button>` : ""}</div>`).join("") || `<div class="empty-state">No custom roles have been added yet.</div>`}</div>${state.isLeader ? `<form class="chat-compose" id="role-form"><input name="role" maxlength="50" required placeholder="Add a role, e.g. Keyboardist"><button class="button button-primary" type="submit">Add role</button></form>` : ""}</section><section class="panel"><div class="panel-heading"><h2>Member roles</h2></div><div class="item-list">${state.members.map((member) => `<div class="availability-row"><span><strong>${escapeHtml(member.fullName || member.username || "Member")}</strong><small>${escapeHtml(member.ministryRole || "No role set")}</small></span></div>`).join("")}</div></section></div>`;
  $("#role-form")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const role = clean(new FormData(event.currentTarget).get("role")).slice(0, 50);
    if (!role || roles.some((item) => item.toLowerCase() === role.toLowerCase())) return toast("That role is already listed.", "error");
    const next = [...roles, role].slice(0, 50);
    try { await updateDoc(doc(db, "teams", state.teamCode), { roles: next }); state.team = { ...state.team, roles: next }; renderView(); }
    catch (error) { toast(prettyError(error), "error"); }
  });
}

function renderRejoinRequests() {
  setPage("Rejoin requests", "Review requests from people asking to return to the team.", "TEAM MANAGEMENT");
  $("#view-root").innerHTML = `<section class="panel"><div class="item-list">${state.rejoinRequests.map((item) => `<article class="announcement-row"><span class="announcement-mark">↺</span><div class="item-main"><strong>${escapeHtml(item.userName || "Former member")}</strong><p>${escapeHtml(item.reason || "They are asking to rejoin the team.")}</p><span>${escapeHtml(item.userEmail || "")} · ${escapeHtml(dateLabel(item.createdAt, { month: "short", day: "numeric", year: "numeric" }))}</span></div><div class="sub-actions"><button class="button button-primary" data-action="resolve-rejoin" data-status="Approved" data-id="${escapeHtml(item.id)}" type="button">Approve</button><button class="button button-quiet" data-action="resolve-rejoin" data-status="Declined" data-id="${escapeHtml(item.id)}" type="button">Decline</button></div></article>`).join("") || `<div class="empty-state"><strong>No pending requests</strong>Member requests to rejoin will appear here.</div>`}</div></section>`;
}

function requestSubstitution() {
  const services = state.services.filter((item) => item.status !== "Draft");
  const teammates = state.members.filter((item) => item.uid !== state.user.uid);
  if (!services.length) return toast("Your team needs a published service before you can request cover.", "error");
  if (!teammates.length) return toast("Invite another team member first.", "error");
  openModal("Request a substitute", "Choose a service and teammate. They can accept or decline the request.", [
    { name: "serviceId", label: "Service", type: "select", required: true, options: services.map((item) => ({ value: item.id, label: `${item.title} · ${dateLabel(item.date, { month: "short", day: "numeric" })}` })) },
    { name: "substituteUid", label: "Ask this teammate", type: "select", required: true, options: teammates.map((item) => ({ value: item.uid, label: `${item.fullName || item.username || "Member"}${item.ministryRole ? ` · ${item.ministryRole}` : ""}` })) },
    { name: "role", label: "Role to cover", required: true, maxLength: 50, value: state.profile?.ministryRole || "", placeholder: "Vocalist, keys, sound…" },
    { name: "reason", label: "Note", type: "textarea", required: true, maxLength: 500, placeholder: "Add a short note for your teammate" }
  ], "Send request", async (values) => {
    const service = services.find((item) => item.id === values.serviceId);
    const member = teammates.find((item) => item.uid === values.substituteUid);
    if (!service || !member) throw new Error("Choose a valid service and teammate.");
    const ref = doc(collection(db, "teams", state.teamCode, "substitutions"));
    await setDoc(ref, { id: ref.id, teamCode: state.teamCode, serviceId: service.id, serviceTitle: service.title || "Worship service", serviceDate: service.date || "", requesterUid: state.user.uid, requesterName: displayName().slice(0, 100), role: clean(values.role).slice(0, 50), substituteUid: member.uid, substituteName: (member.fullName || member.username || "Member").slice(0, 100), reason: clean(values.reason).slice(0, 500), type: "Exclusion", status: "Pending", createdBy: state.user.uid, createdAt: Date.now(), updatedAt: Date.now() });
  });
}

function renderProfile() {
  const p = state.profile || {};
  const name = p.fullName || p.username || "";
  setPage("Profile & settings", "Keep your contact details up to date.", "YOUR ACCOUNT");
  $("#view-root").innerHTML = `<div class="page-columns"><section class="panel"><div class="panel-heading"><h2>Personal information</h2></div><form id="profile-form" class="auth-form"><label>Full name<input name="fullName" value="${escapeHtml(name)}" required maxlength="100"></label><label>Email address<input value="${escapeHtml(state.user?.email || "")}" disabled></label><label>Phone number<input name="phone" type="tel" value="${escapeHtml(p.phone || "")}" maxlength="25" placeholder="Optional"></label><label>Your ministry role<input name="ministryRole" value="${escapeHtml(p.ministryRole || "")}" maxlength="50" placeholder="e.g. Vocalist, Guitarist"></label><label>Country<input name="country" value="${escapeHtml(p.country || "")}" maxlength="50"></label><label>Language<input name="language" value="${escapeHtml(p.language || "English")}" maxlength="50"></label><label>Upload profile photo<input name="photoFile" type="file" accept="image/*"></label><label>Or use a photo URL<input name="photoUri" type="url" value="${escapeHtml(p.photoUri || state.user?.photoURL || "")}" maxlength="500" placeholder="https://…"></label><label class="check-field"><input name="notificationsEnabled" type="checkbox" ${p.notificationsEnabled === false ? "" : "checked"}> Show team notifications</label><label class="check-field"><input name="teamUnmuted" type="checkbox" ${p.teamUnmuted === false ? "" : "checked"}> Keep team updates unmuted</label><button class="button button-primary" type="submit">Save changes</button></form></section><aside class="panel"><div class="panel-heading"><h2>Connected team</h2></div><div class="item-main"><strong>${escapeHtml(state.team?.teamName || "No team")}</strong><span>Invite code: ${escapeHtml(state.teamCode)}</span></div><p class="muted" style="line-height:1.6">This profile and team data sync with the SyncedM Android app through Firebase.</p><button class="button button-quiet" data-action="copy-code" type="button">Copy invite code</button><button class="button button-quiet" id="sign-out" type="button">Sign out</button></aside></div>`;
  $("#profile-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("button[type=submit]", event.currentTarget);
    setBusy(button, true, "Saving…");
    const form = new FormData(event.currentTarget);
    const fullName = clean(form.get("fullName")).slice(0, 100);
    const phone = clean(form.get("phone")).slice(0, 25);
    const ministryRole = clean(form.get("ministryRole")).slice(0, 50);
    const country = clean(form.get("country")).slice(0, 50);
    const language = clean(form.get("language")).slice(0, 50);
    let photoUri = clean(form.get("photoUri")).slice(0, 500);
    const photoFile = form.get("photoFile");
    const notificationsEnabled = form.has("notificationsEnabled");
    const teamUnmuted = form.has("teamUnmuted");
    try {
      if (photoFile instanceof File && photoFile.size) photoUri = await uploadImageToCloudinary(photoFile, 800);
      await updateDoc(doc(db, "users", state.user.uid), { fullName, username: fullName.slice(0, 50), phone, ministryRole, country, language, photoUri, notificationsEnabled, teamUnmuted });
      state.profile = { ...state.profile, fullName, username: fullName.slice(0, 50), phone, ministryRole, country, language, photoUri, notificationsEnabled, teamUnmuted };
      updateIdentity();
      toast("Profile updated.", "success");
      renderView();
    } catch (error) {
      toast(prettyError(error), "error");
      setBusy(button, false);
    }
  });
  $("#sign-out")?.addEventListener("click", () => signOut(auth));
}

function renderView() {
  if (!state.user || !state.team) return;
  switch (state.view) {
    case "schedule": return renderSchedule();
    case "songs": return renderSongs();
    case "team": return renderTeam();
    case "profile": return renderProfile();
    case "more": return renderMore();
    case "calendar": return renderCalendar();
    case "lineups": return renderLineups();
    case "availability": return renderAvailability();
    case "chat": return renderChat();
    case "substitutions": return renderSubstitutions();
    case "notifications": return renderNotifications();
    case "reports": return renderReports();
    case "roles": return renderRoles();
    case "requests": return renderRejoinRequests();
    default: state.view = "home"; return renderHome();
  }
}

function openModal(title, intro, fields, submitLabel, onSubmit) {
  const modal = $("#modal");
  const content = $("#modal-content");
  const fieldMarkup = fields.map((field) => {
    const safeName = escapeHtml(field.name);
    const safeLabel = escapeHtml(field.label);
    const safeValue = escapeHtml(field.value || "");
    const required = field.required ? "required" : "";
    const maxLength = field.maxLength ? `maxlength="${field.maxLength}"` : "";
    if (field.type === "file") return `<label>${safeLabel}<input class="field-input" type="file" name="${safeName}" accept="${escapeHtml(field.accept || "*/*")}" ${required}></label>`;
    if (field.type === "textarea") return `<label>${safeLabel}<textarea class="field-input" name="${safeName}" ${required} ${maxLength} placeholder="${escapeHtml(field.placeholder || "")}">${safeValue}</textarea></label>`;
    if (field.type === "select") return `<label>${safeLabel}<select class="field-input" name="${safeName}" ${required}>${field.options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === field.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>`;
    if (field.type === "checkbox") return `<label class="check-field"><input type="checkbox" name="${safeName}" ${field.value ? "checked" : ""}> ${safeLabel}</label>`;
    return `<label>${safeLabel}<input class="field-input" type="${escapeHtml(field.type || "text")}" name="${safeName}" value="${safeValue}" ${required} ${maxLength} placeholder="${escapeHtml(field.placeholder || "")}" ${field.min ? `min="${escapeHtml(field.min)}"` : ""} ${field.step ? `step="${escapeHtml(field.step)}"` : ""}></label>`;
  }).join("");
  content.innerHTML = `<h2>${escapeHtml(title)}</h2><p class="modal-intro">${escapeHtml(intro)}</p><form id="modal-form">${fieldMarkup}<p class="form-error" id="modal-error"></p><div class="modal-actions"><button class="button button-quiet" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">${escapeHtml(submitLabel)}</button></div></form>`;
  modal.showModal();
  $("#modal-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    fields.filter((field) => field.type === "checkbox").forEach((field) => { values[field.name] = form.has(field.name); });
    const button = $("button[type=submit]", event.currentTarget);
    setBusy(button, true, "Saving…");
    $("#modal-error").textContent = "";
    try {
      await onSubmit(values);
      modal.close();
      toast("Saved and synced with your team.", "success");
    } catch (error) {
      console.error("Unable to save Firestore record", error);
      $("#modal-error").textContent = prettyError(error);
      setBusy(button, false);
    }
  });
}

function transposeChordToken(chord, offset) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const flats = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
  const parts = String(chord).split("/");
  return parts.map((part) => {
    const match = part.match(/^([A-G])([#b]?)(.*)$/);
    if (!match) return part;
    const original = match[1] + match[2];
    const normalized = flats[original] || original;
    const pitch = names.indexOf(normalized);
    if (pitch < 0) return part;
    const transposed = names[(pitch + offset + 120) % 12];
    return (match[2] === "b" ? ({ "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb" }[transposed] || transposed) : transposed) + match[3];
  }).join("/");
}

function transposeSheet(sheet, offset) {
  if (!sheet || !offset) return sheet || "";
  const chordPattern = /^[A-G](?:#|b)?(?:maj|min|m|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?$/i;
  return String(sheet).split("\n").map((line) => {
    const trimmed = line.trim();
    const tokens = trimmed.split(/[\s|]+/).filter(Boolean);
    if (tokens.length && tokens.every((token) => chordPattern.test(token))) return line.replace(/[A-G](?:#|b)?(?:maj|min|m|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?/g, (chord) => transposeChordToken(chord, offset));
    return line.replace(/\[([A-G](?:#|b)?(?:maj|min|m|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?)\]/g, (_, chord) => `[${transposeChordToken(chord, offset)}]`);
  }).join("\n");
}

function formatChordSheet(sheet) {
  const section = /^(?:intro|verse|pre[- ]?chorus|chorus|bridge|interlude|instrumental|solo|outro|ending|tag)(?:\s+\d+)?\s*:?$/i;
  return String(sheet || "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/^\uFEFF/, "").split("\n").map((line) => {
    let out = "";
    for (const char of line) out += char === "\t" ? " ".repeat(4 - out.length % 4) : char;
    const value = out.replace(/ +$/, "");
    return section.test(value.trim()) ? `[${value.trim().replace(/:$/, "")}]` : value;
  }).join("\n");
}

function songReferenceMarkup(reference) {
  if (!/^https?:\/\//i.test(reference || "")) return "";
  try {
    const url = new URL(reference);
    let videoId = "";
    if (url.hostname === "youtu.be" || url.hostname.endsWith(".youtu.be")) videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    else if (url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com")) videoId = url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts)\/([^/?]+)/)?.[1] || "";
    if (/^[\w-]{11}$/.test(videoId)) return `<div class="song-video"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="Song rehearsal video" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
  } catch (_) { return ""; }
  return `<a class="reference-link" href="${escapeHtml(reference)}" target="_blank" rel="noopener noreferrer">Open song reference ↗</a>`;
}

function songDisplayMode() {
  const service = state.services.find((item) => item.id === state.selectedServiceId);
  const fullName = clean(state.profile?.fullName || state.profile?.username).toLowerCase();
  const assignment = (service?.assignments || []).find((item) => item.uid === state.user?.uid || (item.name && clean(item.name).toLowerCase() === fullName));
  const assignedRole = clean(assignment?.role).toLowerCase();
  const profileRole = clean(state.profile?.ministryRole || state.profile?.role).toLowerCase();
  const isVocal = (role) => /\b(vocal\w*|sing\w*|choir|chorus|voice)\b/i.test(role);
  const isInstrumental = (role) => /\b(guitar\w*|keyboard\w*|piano\w*|keys|bass\w*|drum\w*|percussion|instrumentalist|instrument|musician|organ|violin|cello|flute|sax\w*|trumpet)\b/i.test(role);
  if (isVocal(assignedRole)) return "lyrics";
  if (isInstrumental(assignedRole)) return "chords";
  if (isVocal(profileRole)) return "lyrics";
  if (isInstrumental(profileRole)) return "chords";
  return "both";
}

function openSong(song) {
  const modal = $("#modal");
  state.songTranspose = 0;
  state.sheetScrollSpeed = 35;
  const displayMode = songDisplayMode();
  const reference = clean(song.referenceUrl || "");
  const safeReference = songReferenceMarkup(reference);
  const sheet = song.sheet?.trim() ? `<div><div class="transpose-controls"><strong>Chord sheet</strong><span><button class="icon-button" data-action="transpose-song" data-delta="-1" data-id="${escapeHtml(song.id)}" aria-label="Transpose down" type="button">−</button><b id="song-key-label">Key ${escapeHtml(song.key || "C")}</b><button class="icon-button" data-action="transpose-song" data-delta="1" data-id="${escapeHtml(song.id)}" aria-label="Transpose up" type="button">＋</button></span></div><div class="sheet-actions"><button class="link-button" data-action="toggle-sheet-scroll" type="button">Start auto-scroll</button><button class="link-button" data-action="format-song-sheet" data-id="${escapeHtml(song.id)}" type="button">Format sections</button></div><label class="scroll-speed-control" for="sheet-scroll-speed"><span>Auto-scroll speed</span><input id="sheet-scroll-speed" type="range" min="10" max="100" step="5" value="35"><output id="sheet-scroll-speed-value">35 px/s</output></label><pre id="song-sheet">${escapeHtml(formatChordSheet(song.sheet))}</pre></div>` : `<div class="sheet-empty"><strong>Chord sheet not added yet</strong><p>Ask your team leader to add the chart to this song in the shared song library.</p></div>`;
  const lyrics = song.lyrics?.trim() ? `<div class="song-lyrics"><strong>Lyrics</strong><p>${escapeHtml(song.lyrics)}</p></div>` : `<div class="sheet-empty"><strong>Lyrics not added yet</strong><p>Ask your team leader to add the lyrics to this song in the shared song library.</p></div>`;
  const metronome = Number(song.bpm) > 0 ? `<button class="button button-quiet" data-action="metronome" data-bpm="${Math.max(30, Math.min(240, Number(song.bpm)))}" type="button">▶ Start metronome · ${escapeHtml(song.bpm)} BPM</button>` : "";
  const roleView = displayMode === "lyrics" ? "VOCALIST VIEW" : displayMode === "chords" ? "INSTRUMENTALIST VIEW" : "TEAM SONG";
  const detail = displayMode === "lyrics" ? lyrics : displayMode === "chords" ? `${sheet}${safeReference}${metronome}` : `${sheet}${lyrics}${safeReference || `<p class="muted">No audio or video reference has been added.</p>`}${metronome}`;
  const intro = displayMode === "lyrics" ? escapeHtml(song.artist || "Team arrangement") : `${escapeHtml(song.artist || "Team arrangement")} · ${escapeHtml(song.bpm || "—")} BPM`;
  $("#modal-content").innerHTML = `<p class="eyebrow">${roleView}</p><h2>${escapeHtml(song.title || "Untitled song")}</h2><p class="modal-intro">${intro}</p><div class="modal-detail">${detail}</div>${state.isLeader ? `<div class="modal-actions"><button class="button button-quiet" data-action="delete-song" data-id="${escapeHtml(song.id)}" type="button">Delete song</button><button class="button button-quiet" data-action="edit-song" data-id="${escapeHtml(song.id)}" type="button">Edit song</button><button class="button button-primary" data-action="close-modal" type="button">Done</button></div>` : `<div class="modal-actions"><button class="button button-primary" data-action="close-modal" type="button">Done</button></div>`}`;
  modal.showModal();
}

function editSong(song) {
  if (!state.isLeader) return;
  openModal("Edit team song", "Update the arrangement shared with your team.", [
    { name: "title", label: "Song title", required: true, maxLength: 120, value: song.title || "" },
    { name: "artist", label: "Artist", maxLength: 100, value: song.artist || "" },
    { name: "key", label: "Musical key", required: true, maxLength: 10, value: song.key || "C" },
    { name: "bpm", label: "Tempo (BPM)", type: "number", min: "1", step: "1", value: song.bpm || 74 },
    { name: "referenceUrl", label: "Audio or video link", type: "url", value: song.referenceUrl || "" },
    { name: "sheet", label: "Chord sheet", type: "textarea", maxLength: 30000, value: song.sheet || "" },
    { name: "lyrics", label: "Lyrics", type: "textarea", maxLength: 20000, value: song.lyrics || "" }
  ], "Save song", async (values) => {
    await updateDoc(doc(db, "teams", state.teamCode, "songs", song.id), { title: clean(values.title).slice(0, 120), artist: clean(values.artist).slice(0, 100), key: clean(values.key).slice(0, 10), bpm: Number(values.bpm) || 74, referenceUrl: clean(values.referenceUrl).slice(0, 1000), sheet: String(values.sheet || "").slice(0, 30000), lyrics: String(values.lyrics || "").slice(0, 20000), updatedAt: Date.now() });
  });
}

async function newDocumentId(collectionRef) {
  const ref = doc(collectionRef);
  return ref.id;
}

async function addService() {
  editService(null);
}

function editService(service) {
  if (!state.isLeader) return;
  const today = new Date().toISOString().slice(0, 10);
  const songLines = (service?.songs || []).map((item) => typeof item === "string" ? item : item.title || "").filter(Boolean).join("\n");
  const assignmentLines = (service?.assignments || []).map((item) => `${item.role || ""}: ${item.name || ""}`).join("\n");
  const fields = [
    { name: "title", label: "Service name", required: true, maxLength: 100, value: service?.title || "", placeholder: "Sunday Worship" },
    { name: "date", label: "Date", type: "date", required: true, value: service?.date || today },
    { name: "start", label: "Start time", type: "time", required: true, value: service?.start || "09:00" },
    { name: "end", label: "End time", type: "time", required: true, value: service?.end || "10:30" },
    { name: "venue", label: "Venue", required: true, maxLength: 100, value: service?.venue || "", placeholder: "Grace Community Church" },
    { name: "status", label: "Visibility", type: "select", value: service?.status || "Published", options: [{ value: "Published", label: "Published — visible to team" }, { value: "Draft", label: "Draft — leader only" }] },
    { name: "coverImage", label: "Upload service cover image (optional)", type: "file", accept: "image/*" },
    { name: "coverImageUrl", label: "Or use a cover image URL", type: "url", value: service?.coverImageUrl || "", maxLength: 1000 },
    { name: "songs", label: "Setlist — one song title per line", type: "textarea", value: songLines, maxLength: 5000, placeholder: "Goodness of God\nBuild My Life" },
    { name: "assignments", label: "Team assignments — one Role: Name per line", type: "textarea", value: assignmentLines, maxLength: 4000, placeholder: "Worship leader: Mark\nKeys: Mia" },
    { name: "rehearsalDate", label: "Rehearsal date (optional)", type: "date", value: service?.rehearsal?.date || "" },
    { name: "rehearsalStart", label: "Rehearsal start", type: "time", value: service?.rehearsal?.start || "" },
    { name: "rehearsalEnd", label: "Rehearsal end", type: "time", value: service?.rehearsal?.end || "" },
    { name: "rehearsalVenue", label: "Rehearsal location", maxLength: 100, value: service?.rehearsal?.venue || "" },
    { name: "rehearsalNotes", label: "Rehearsal notes", type: "textarea", maxLength: 2000, value: service?.rehearsal?.notes || "" }
  ];
  openModal(service ? "Edit service plan" : "Plan a service", "Build a service plan with a setlist, team assignments, and rehearsal details.", fields, service ? "Save changes" : "Create service", async (values) => {
    const songs = clean(values.songs).split(/\r?\n/).map(clean).filter(Boolean).slice(0, 50).map((title) => {
      const known = state.songs.find((item) => item.title?.toLowerCase() === title.toLowerCase());
      return known ? { id: known.id, title: known.title, artist: known.artist || "", key: known.key || "C", bpm: Number(known.bpm) || 0 } : { id: "", title: title.slice(0, 120), artist: "", key: "C", bpm: 0 };
    });
    const assignments = clean(values.assignments).split(/\r?\n/).map(clean).filter(Boolean).slice(0, 50).map((line) => {
      const [roleRaw, ...nameParts] = line.split(/:|—|-/); const role = clean(roleRaw).slice(0, 50); const name = clean(nameParts.join(" ")).slice(0, 100);
      const member = state.members.find((item) => `${item.fullName || item.username || ""}`.toLowerCase() === name.toLowerCase());
      return { uid: member?.uid || "", email: member?.email || "", name: member ? (member.fullName || member.username || name) : name, role };
    });
    let coverImageUrl = clean(values.coverImageUrl).slice(0, 1000);
    if (values.coverImage instanceof File && values.coverImage.size) coverImageUrl = await uploadImageToCloudinary(values.coverImage, 1200);
    const payload = {
      title: clean(values.title).slice(0, 100), date: clean(values.date), start: clean(values.start), end: clean(values.end), venue: clean(values.venue).slice(0, 100),
      status: values.status === "Draft" ? "Draft" : "Published", songs, assignments, coverImageUrl,
      rehearsal: { date: clean(values.rehearsalDate), start: clean(values.rehearsalStart), end: clean(values.rehearsalEnd), venue: clean(values.rehearsalVenue).slice(0, 100), notes: clean(values.rehearsalNotes).slice(0, 2000) }, updatedAt: Date.now()
    };
    if (service) await updateDoc(doc(db, "teams", state.teamCode, "services", service.id), payload);
    else { const ref = doc(collection(db, "teams", state.teamCode, "services")); await setDoc(ref, { ...payload, id: ref.id, teamCode: state.teamCode, createdBy: state.user.uid, createdAt: Date.now() }); }
  });
}

function openService(service) {
  if (!service) return;
  const songs = (service.songs || []).map((item) => typeof item === "string" ? item : item.title || "Song");
  const assignments = (service.assignments || []).map((item) => `${item.role || "Team"}: ${item.name || "To be assigned"}`);
  const conflicts = (service.assignments || []).filter((assignment) => {
    const member = state.members.find((item) => (assignment.uid && item.uid === assignment.uid) || (assignment.name && (item.fullName || item.username || "").toLowerCase() === assignment.name.toLowerCase()));
    return member && (member.unavailableRanges || []).some((range) => range.startDate && range.endDate && service.date >= range.startDate && service.date <= range.endDate);
  });
  const rehearsal = service.rehearsal || {};
  const songMarkup = songs.length ? `<ul>${songs.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}</ul>` : `<p class="muted">No songs added yet.</p>`;
  const coverMarkup = /^https:\/\//i.test(service.coverImageUrl || "") ? `<img class="service-cover" src="${escapeHtml(service.coverImageUrl)}" alt="Cover for ${escapeHtml(service.title || "service")}" loading="lazy">` : "";
  $("#modal-content").innerHTML = `<p class="eyebrow">${escapeHtml(service.status || "SERVICE")}</p><h2>${escapeHtml(service.title || "Worship service")}</h2><p class="modal-intro">${escapeHtml(dateLabel(service.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }))} · ${escapeHtml(service.start ? timeLabel(service.start) : "Time TBD")} – ${escapeHtml(service.end ? timeLabel(service.end) : "")} · ${escapeHtml(service.venue || "Location to be announced")}</p>${coverMarkup}<div class="modal-detail"><div><strong>Setlist</strong>${songMarkup}</div><div><strong>Team assignments</strong>${assignments.length ? `<ul>${assignments.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : `<p class="muted">No assignments yet.</p>`}</div>${conflicts.length ? `<div class="conflict-note"><strong>Availability conflict</strong><p>${conflicts.map((item) => escapeHtml(item.name || "A team member")).join(", ")} marked unavailable on this date.</p></div>` : ""}<div><strong>Rehearsal</strong><p>${rehearsal.date ? `${escapeHtml(dateLabel(rehearsal.date, { weekday: "long", month: "long", day: "numeric" }))}${rehearsal.start ? ` · ${escapeHtml(timeLabel(rehearsal.start))}` : ""}${rehearsal.end ? `–${escapeHtml(timeLabel(rehearsal.end))}` : ""}${rehearsal.venue ? ` · ${escapeHtml(rehearsal.venue)}` : ""}` : "No rehearsal planned."}${rehearsal.notes ? `<br>${escapeHtml(rehearsal.notes)}` : ""}</p></div></div><div class="modal-actions"><button class="button button-quiet" data-action="view-lineup" data-id="${escapeHtml(service.id)}" type="button">View full lineup</button>${state.isLeader ? `<button class="button button-quiet" data-action="delete-service" data-id="${escapeHtml(service.id)}" type="button">Delete</button><button class="button button-quiet" data-action="edit-service" data-id="${escapeHtml(service.id)}" type="button">Edit plan</button>` : ""}<button class="button button-primary" data-action="close-modal" type="button">Done</button></div>`;
  $("#modal").showModal();
}

async function addSong() {
  openModal("Add a team song", "The song will appear in the shared catalog for everyone in the team.", [
    { name: "title", label: "Song title", required: true, maxLength: 120, placeholder: "Goodness of God" },
    { name: "artist", label: "Artist", maxLength: 100, placeholder: "CeCe Winans" },
    { name: "key", label: "Musical key", required: true, maxLength: 10, value: "C", placeholder: "C, D, F#…" },
    { name: "bpm", label: "Tempo (BPM)", type: "number", min: "1", step: "1", value: "74" },
    { name: "referenceUrl", label: "Audio or video link", type: "url", placeholder: "https://…" },
    { name: "sheet", label: "Chord sheet", type: "textarea", maxLength: 30000, placeholder: "Paste chord chart or arrangement notes" },
    { name: "lyrics", label: "Lyrics (optional)", type: "textarea", maxLength: 20000, placeholder: "Add lyrics or section cues" }
  ], "Add to library", async (values) => {
    const id = await newDocumentId(collection(db, "teams", state.teamCode, "songs"));
    let referenceUrl = clean(values.referenceUrl || "");
    if (referenceUrl && !/^https?:\/\//i.test(referenceUrl)) referenceUrl = `https://${referenceUrl}`;
    await setDoc(doc(db, "teams", state.teamCode, "songs", id), {
      id,
      teamCode: state.teamCode,
      title: clean(values.title).slice(0, 120),
      artist: clean(values.artist).slice(0, 100),
      key: clean(values.key).slice(0, 10) || "C",
      bpm: Number(values.bpm) || 74,
      referenceUrl: referenceUrl.slice(0, 1000),
      sheet: String(values.sheet || "").slice(0, 30000),
      lyrics: String(values.lyrics || "").slice(0, 20000),
      createdBy: state.user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  });
}

async function addAnnouncement() {
  openModal("Post an announcement", "Share an update with everyone on your worship team.", [
    { name: "title", label: "Headline", required: true, maxLength: 120, placeholder: "Rehearsal this Saturday" },
    { name: "message", label: "Message", type: "textarea", required: true, maxLength: 2000, placeholder: "Share the details your team needs…" },
    { name: "urgent", label: "Mark as urgent", type: "checkbox" }
  ], "Post update", async (values) => {
    const id = await newDocumentId(collection(db, "teams", state.teamCode, "announcements"));
    await setDoc(doc(db, "teams", state.teamCode, "announcements", id), {
      id,
      teamCode: state.teamCode,
      title: clean(values.title).slice(0, 120),
      message: clean(values.message).slice(0, 2000),
      urgent: Boolean(values.urgent),
      author: displayName().slice(0, 100),
      createdBy: state.user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  });
}

function editAnnouncement(announcement) {
  if (!state.isLeader) return;
  openModal("Edit announcement", "Update the message your team can see.", [
    { name: "title", label: "Headline", required: true, maxLength: 120, value: announcement.title || "" },
    { name: "message", label: "Message", type: "textarea", required: true, maxLength: 2000, value: announcement.message || "" },
    { name: "urgent", label: "Mark as urgent", type: "checkbox", value: Boolean(announcement.urgent) }
  ], "Save update", async (values) => {
    await updateDoc(doc(db, "teams", state.teamCode, "announcements", announcement.id), { title: clean(values.title).slice(0, 120), message: clean(values.message).slice(0, 2000), urgent: Boolean(values.urgent), updatedAt: Date.now() });
  });
}

async function createTeam(teamName, requestedCode = "") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = clean(requestedCode).toUpperCase();
  if (code && !/^[A-Z0-9]{6}$/.test(code)) throw new Error("Use exactly six letters or numbers for a custom invite code.");
  if (code) {
    if ((await getDoc(doc(db, "teams", code))).exists()) throw new Error("That invite code is already in use. Choose another one.");
  } else {
    for (let attempt = 0; attempt < 12; attempt++) {
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      code = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
      if (!(await getDoc(doc(db, "teams", code))).exists()) break;
      code = "";
    }
  }
  if (!code) throw new Error("Could not find an available team code. Please try again.");
  const name = clean(teamName).slice(0, 100);
  await setDoc(doc(db, "teams", code), {
    teamCode: code,
    teamName: name,
    leaderUid: state.user.uid,
    leaderName: displayName().slice(0, 100),
    roles: ["Worship Leader", "Substitute Leader", "Vocalist", "Guitarist", "Keyboardist", "Bassist", "Drummer", "Sound Operator"],
    removedMembers: [],
    createdAt: Date.now()
  });
  await updateDoc(doc(db, "users", state.user.uid), { teamCode: code, teamName: name, role: "Leader", removedByLeader: false, removedTeamCode: "" });
  state.profile = { ...state.profile, teamCode: code, teamName: name, role: "Leader", removedByLeader: false, removedTeamCode: "" };
  await initializeSignedInWorkspace(state.user);
  toast(`Team created. Invite code: ${code}`, "success");
}

async function joinTeam(codeInput) {
  const code = clean(codeInput).toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("Enter the six-character team invite code.");
  const teamSnapshot = await getDoc(doc(db, "teams", code));
  if (!teamSnapshot.exists()) throw new Error("No team was found with that invite code.");
  const team = teamSnapshot.data();
  if (team.leaderUid !== state.user.uid && state.profile.removedByLeader === true && state.profile.removedTeamCode === code) {
    throw new Error("Your previous team needs to approve your rejoin request.");
  }
  await updateDoc(doc(db, "users", state.user.uid), {
    teamCode: code,
    teamName: String(team.teamName || "").slice(0, 100),
    role: team.leaderUid === state.user.uid ? "Leader" : "Member",
    removedByLeader: false,
    removedTeamCode: "",
    joinedAt: Date.now()
  });
  state.profile = { ...state.profile, teamCode: code, teamName: team.teamName, role: team.leaderUid === state.user.uid ? "Leader" : "Member", removedByLeader: false, removedTeamCode: "", joinedAt: Date.now() };
  await initializeSignedInWorkspace(state.user);
  toast(`You joined ${team.teamName}.`, "success");
}

function showRegisterMode(register) {
  $("#register-form").classList.toggle("is-hidden", !register);
  $("#sign-in-form").classList.toggle("is-hidden", register);
  $("#auth-title").textContent = register ? "Create your account" : "Sign in to SyncedM";
  $("#auth-subtitle").textContent = register ? "Start planning with your worship team." : "Your team’s next service is waiting.";
  $("#auth-switch").innerHTML = register ? `Already have an account? <button class="link-button" id="show-sign-in" type="button">Sign in</button>` : `New to SyncedM? <button class="link-button" id="show-register" type="button">Create an account</button>`;
  $(".divider span").textContent = register ? "or register with email" : "or continue with email";
  $(".auth-form-wrap .eyebrow").textContent = register ? "JOIN YOUR TEAM" : "WELCOME BACK";
  setAuthMessage("");
}

$("#auth-switch").addEventListener("click", (event) => {
  if (event.target.id === "show-register") showRegisterMode(true);
  if (event.target.id === "show-sign-in") showRegisterMode(false);
});

$("#sign-in-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthMessage("");
  const button = $("button[type=submit]", event.currentTarget);
  setBusy(button, true, "Signing in…");
  const form = new FormData(event.currentTarget);
  try {
    await signInWithEmailAndPassword(auth, clean(form.get("email")), String(form.get("password") || ""));
  } catch (error) {
    setAuthMessage(prettyError(error));
    setBusy(button, false);
  }
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthMessage("");
  const button = $("button[type=submit]", event.currentTarget);
  setBusy(button, true, "Creating account…");
  const form = new FormData(event.currentTarget);
  pendingNewUserName = clean(form.get("name")).slice(0, 100);
  try {
    const credential = await createUserWithEmailAndPassword(auth, clean(form.get("email")), String(form.get("password") || ""));
    await updateProfile(credential.user, { displayName: pendingNewUserName });
    await createMissingProfile(credential.user);
    await updateDoc(doc(db, "users", credential.user.uid), { fullName: pendingNewUserName, username: pendingNewUserName.slice(0, 50) });
  } catch (error) {
    pendingNewUserName = "";
    setAuthMessage(prettyError(error));
    setBusy(button, false);
  }
});

$("#google-sign-in").addEventListener("click", async (event) => {
  setAuthMessage("");
  setBusy(event.currentTarget, true, "Opening Google…");
  try {
    if (isIOSBrowser && location.hostname === "synedn.web.app") {
      await signInWithRedirect(auth, googleProvider);
      return;
    }
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    setAuthMessage(prettyError(error));
    setBusy(event.currentTarget, false);
  }
});

$("#forgot-password").addEventListener("click", async () => {
  const email = clean(new FormData($("#sign-in-form")).get("email"));
  if (!email) {
    setAuthMessage("Enter your email address first, then choose Forgot password.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setAuthMessage("Password reset email sent. Check your inbox.");
  } catch (error) {
    setAuthMessage(prettyError(error));
  }
});

$("#join-team-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorNode = $("#onboarding-error");
  errorNode.textContent = "";
  const button = $("button[type=submit]", event.currentTarget);
  setBusy(button, true, "Joining…");
  try {
    await joinTeam(new FormData(event.currentTarget).get("teamCode"));
  } catch (error) {
    errorNode.textContent = prettyError(error);
    setBusy(button, false);
  }
});

$("#create-team-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorNode = $("#onboarding-error");
  errorNode.textContent = "";
  const button = $("button[type=submit]", event.currentTarget);
  setBusy(button, true, "Creating…");
  try {
    const form = new FormData(event.currentTarget);
    await createTeam(form.get("teamName"), form.get("teamCode"));
  } catch (error) {
    errorNode.textContent = prettyError(error);
    setBusy(button, false);
  }
});

$("#create-team-form input[name=teamCode]").addEventListener("input", (event) => {
  event.currentTarget.value = event.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
});

$("#rejoin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const teamCode = clean(state.profile?.removedTeamCode).toUpperCase();
  if (!teamCode) return;
  const button = $("button[type=submit]", event.currentTarget);
  const errorNode = $("#onboarding-error");
  errorNode.textContent = "";
  setBusy(button, true, "Sending…");
  try {
    const requests = await getDocs(query(collection(db, "teams", teamCode, "rejoin_requests"), where("userUid", "==", state.user.uid)));
    if (requests.docs.some((item) => item.data().status === "Pending")) {
      errorNode.textContent = "Your rejoin request is already waiting for the leader.";
      return;
    }
    const ref = doc(collection(db, "teams", teamCode, "rejoin_requests"));
    await setDoc(ref, { id: ref.id, teamCode, userUid: state.user.uid, userName: displayName().slice(0, 100), userEmail: (state.user.email || "").slice(0, 100), reason: clean(new FormData(event.currentTarget).get("reason")).slice(0, 500), status: "Pending", createdAt: Date.now(), updatedAt: Date.now() });
    event.currentTarget.reset();
    errorNode.textContent = "Request sent. Your team leader can approve it from the Android app.";
  } catch (error) { errorNode.textContent = prettyError(error); }
  finally { setBusy(button, false); }
});

$("#onboarding-sign-out").addEventListener("click", () => signOut(auth));
$("#team-switcher").addEventListener("click", () => { if (state.teamCode) { navigator.clipboard?.writeText(state.teamCode).then(() => toast(`Invite code copied: ${state.teamCode}`, "success")).catch(() => toast(`Invite code: ${state.teamCode}`)); } });
$("#profile-shortcut").addEventListener("click", () => goTo("profile"));
$("#notifications-shortcut").addEventListener("click", () => goTo("notifications"));

$("#onboarding-shell").addEventListener("click", (event) => {
  const button = event.target.closest("[data-onboarding]");
  if (!button) return;
  const mode = button.dataset.onboarding;
  $$("[data-onboarding]").forEach((item) => item.classList.toggle("active", item === button));
  $("#join-team-form").classList.toggle("is-hidden", mode !== "join");
  $("#create-team-form").classList.toggle("is-hidden", mode !== "create");
  $("#onboarding-error").textContent = "";
});

document.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    goTo(viewButton.dataset.view);
    return;
  }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  switch (action.dataset.action) {
    case "add-service": if (state.isLeader) addService(); break;
    case "add-song": if (state.isLeader) addSong(); break;
    case "add-announcement": if (state.isLeader) addAnnouncement(); break;
    case "edit-announcement": {
      const announcement = state.announcements.find((item) => item.id === action.dataset.id);
      if (announcement && state.isLeader) editAnnouncement(announcement);
      break;
    }
    case "open-song": {
      const song = state.songs.find((item) => item.id === action.dataset.id);
      if (song) openSong(song);
      break;
    }
    case "edit-song": {
      const song = state.songs.find((item) => item.id === action.dataset.id);
      if (song && state.isLeader) { $("#modal").close(); editSong(song); }
      break;
    }
    case "transpose-song": {
      const song = state.songs.find((item) => item.id === action.dataset.id);
      if (!song) break;
      state.songTranspose = (state.songTranspose + Number(action.dataset.delta) + 12) % 12;
      $("#song-key-label").textContent = `Key ${transposeChordToken(song.key || "C", state.songTranspose)}`;
      $("#song-sheet").textContent = transposeSheet(song.sheet || "", state.songTranspose);
      break;
    }
    case "toggle-sheet-scroll": {
      const pre = $("#song-sheet");
      if (!pre) break;
      if (state.chordScrollTimer) {
        clearInterval(state.chordScrollTimer); state.chordScrollTimer = null; action.textContent = "Start auto-scroll";
      } else {
        action.textContent = "Pause auto-scroll";
        state.chordScrollTimer = setInterval(() => {
          if (!pre.isConnected || pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 2) {
            clearInterval(state.chordScrollTimer); state.chordScrollTimer = null; action.textContent = "Start auto-scroll"; return;
          }
          pre.scrollTop += state.sheetScrollSpeed / 20;
        }, 50);
      }
      break;
    }
    case "format-song-sheet": {
      const song = state.songs.find((item) => item.id === action.dataset.id);
      const pre = $("#song-sheet");
      if (song && pre) pre.textContent = transposeSheet(formatChordSheet(song.sheet || ""), state.songTranspose);
      break;
    }
    case "metronome": {
      if (state.metronomeTimer) {
        clearInterval(state.metronomeTimer); state.metronomeTimer = null;
        const ctx = state.metronomeContext; state.metronomeContext = null; ctx?.close();
        action.textContent = `▶ Start metronome · ${action.dataset.bpm} BPM`;
      } else {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) throw new Error("Audio is not supported in this browser.");
          const ctx = new AudioCtx(); state.metronomeContext = ctx; await ctx.resume();
          const bpm = Number(action.dataset.bpm) || 80;
          const tick = () => { const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = 1000; gain.gain.setValueAtTime(.18, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .055); osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .06); };
          tick(); state.metronomeTimer = setInterval(tick, 60000 / bpm); action.textContent = `■ Stop metronome · ${bpm} BPM`;
        } catch (error) { toast(error.message || "Could not start audio.", "error"); }
      }
      break;
    }
    case "open-service": {
      const service = state.services.find((item) => item.id === action.dataset.id);
      if (service) openService(service);
      break;
    }
    case "open-lineup":
      state.selectedServiceId = action.dataset.id;
      goTo("lineups");
      break;
    case "view-lineup":
      state.selectedServiceId = action.dataset.id;
      $("#modal").close();
      goTo("lineups");
      break;
    case "back-lineups":
      state.selectedServiceId = "";
      renderView();
      break;
    case "edit-service": {
      const service = state.services.find((item) => item.id === action.dataset.id);
      if (service && state.isLeader) { $("#modal").close(); editService(service); }
      break;
    }
    case "calendar-prev": state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1); renderView(); break;
    case "calendar-next": state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1); renderView(); break;
    case "remove-availability": {
      const ranges = (state.profile?.unavailableRanges || []).filter((item) => item.id !== action.dataset.id);
      try { await updateDoc(doc(db, "users", state.user.uid), { unavailableRanges: ranges }); state.profile = { ...state.profile, unavailableRanges: ranges }; renderView(); }
      catch (error) { toast(prettyError(error), "error"); }
      break;
    }
    case "edit-message": {
      const message = state.messages.find((item) => item.id === action.dataset.id);
      if (!message || message.senderUid !== state.user.uid) break;
      const text = window.prompt("Edit your message", message.text || "");
      if (text === null) break;
      try { await updateDoc(doc(db, "teams", state.teamCode, "messages", message.id), { text: clean(text).slice(0, 2000), isEdited: true, editedAt: Date.now() }); }
      catch (error) { toast(prettyError(error), "error"); }
      break;
    }
    case "delete-message":
      if (!window.confirm("Delete this team message?")) break;
      try { await deleteDoc(doc(db, "teams", state.teamCode, "messages", action.dataset.id)); }
      catch (error) { toast(prettyError(error), "error"); }
      break;
    case "request-substitution": requestSubstitution(); break;
    case "substitution-status": {
      const item = state.substitutions.find((entry) => entry.id === action.dataset.id);
      if (!item) break;
      try { await updateDoc(doc(db, "teams", state.teamCode, "substitutions", item.id), { status: action.dataset.status, updatedAt: Date.now() }); }
      catch (error) { toast(prettyError(error), "error"); }
      break;
    }
    case "dismiss-notification": {
      const key = `syncedm-dismissed-${state.user.uid}`;
      const ids = new Set(JSON.parse(localStorage.getItem(key) || "[]")); ids.add(action.dataset.id); localStorage.setItem(key, JSON.stringify([...ids])); updateNotificationBadge(); renderView();
      break;
    }
    case "clear-notifications": {
      const key = `syncedm-dismissed-${state.user.uid}`;
      const ids = [...state.services.map((item) => `service-${item.id}`), ...state.announcements.map((item) => `announcement-${item.id}`), ...state.substitutions.map((item) => `sub-${item.id}`)];
      localStorage.setItem(key, JSON.stringify(ids)); updateNotificationBadge(); renderView();
      break;
    }
    case "enable-browser-alerts": {
      if (!("Notification" in window)) { toast("Browser alerts are not supported in this browser.", "error"); break; }
      try {
        const permission = await Notification.requestPermission();
        toast(permission === "granted" ? "Browser alerts enabled while SyncedM is open." : "Browser alert permission was not granted.", permission === "granted" ? "success" : "error");
        renderView();
      } catch (error) { toast(error.message || "Could not enable browser alerts.", "error"); }
      break;
    }
    case "delete-report":
      if (!state.isLeader || !window.confirm("Delete this report after reviewing it?")) break;
      try { await deleteDoc(doc(db, "teams", state.teamCode, "reports", action.dataset.id)); }
      catch (error) { toast(prettyError(error), "error"); }
      break;
    case "remove-role": {
      if (!state.isLeader) break;
      const roles = (state.team.roles || []).filter((role) => role !== action.dataset.role);
      try { await updateDoc(doc(db, "teams", state.teamCode), { roles }); state.team = { ...state.team, roles }; renderView(); }
      catch (error) { toast(prettyError(error), "error"); }
      break;
    }
    case "edit-member-role": {
      if (!state.isLeader) break;
      const member = state.members.find((item) => item.uid === action.dataset.id);
      if (!member) break;
      const options = [...new Set([member.ministryRole, ...(state.team.roles || [])].filter(Boolean))];
      openModal("Update ministry role", `Set the role shown for ${member.fullName || member.username || "this member"}.`, [{ name: "ministryRole", label: "Ministry role", type: "select", value: member.ministryRole || "", options: [{ value: "", label: "No role" }, ...options.map((role) => ({ value: role, label: role }))] }], "Save role", async (values) => {
        await updateDoc(doc(db, "users", member.uid), { ministryRole: clean(values.ministryRole).slice(0, 50) });
      });
      break;
    }
    case "remove-member": {
      if (!state.isLeader) break;
      const member = state.members.find((item) => item.uid === action.dataset.id);
      if (!member || !window.confirm(`Remove ${member.fullName || member.username || "this member"} from the team? They can submit a rejoin request later.`)) break;
      const removedMembers = [...new Set([...(state.team.removedMembers || []), member.uid])].slice(-200);
      const batch = writeBatch(db);
      batch.update(doc(db, "users", member.uid), { teamCode: "", teamName: "", role: "", removedByLeader: true, removedTeamCode: state.teamCode });
      batch.update(doc(db, "teams", state.teamCode), { removedMembers });
      try { await batch.commit(); state.team = { ...state.team, removedMembers }; toast("Member removed from the team.", "success"); }
      catch (error) { toast(prettyError(error), "error"); }
      break;
    }
    case "resolve-rejoin": {
      if (!state.isLeader) break;
      const request = state.rejoinRequests.find((item) => item.id === action.dataset.id);
      if (!request) break;
      const status = action.dataset.status;
      const batch = writeBatch(db);
      batch.update(doc(db, "teams", state.teamCode, "rejoin_requests", request.id), { status, updatedAt: Date.now() });
      if (status === "Approved") {
        batch.update(doc(db, "users", request.userUid), { teamCode: state.teamCode, teamName: state.team.teamName || "", role: "Member", removedByLeader: false, removedTeamCode: "", joinedAt: Date.now() });
      }
      try { await batch.commit(); toast(status === "Approved" ? "Member restored to the team." : "Request declined.", "success"); }
      catch (error) { toast(prettyError(error), "error"); }
      break;
    }
    case "close-modal": $("#modal").close(); break;
    case "copy-code":
      try { await navigator.clipboard.writeText(state.teamCode); toast(`Invite code copied: ${state.teamCode}`, "success"); }
      catch { toast(`Team invite code: ${state.teamCode}`); }
      break;
    case "delete-service":
      if (!state.isLeader || !window.confirm("Delete this service from the team schedule?")) break;
      try { await deleteDoc(doc(db, "teams", state.teamCode, "services", action.dataset.id)); if ($("#modal").open) $("#modal").close(); toast("Service deleted.", "success"); }
      catch (error) { toast(prettyError(error), "error"); }
      break;
    case "delete-song":
      if (!state.isLeader || !window.confirm("Delete this song from the team library?")) break;
      try { await deleteDoc(doc(db, "teams", state.teamCode, "songs", action.dataset.id)); $("#modal").close(); toast("Song deleted.", "success"); }
      catch (error) { toast(prettyError(error), "error"); }
      break;
    case "delete-announcement":
      if (!state.isLeader || !window.confirm("Delete this announcement for the whole team?")) break;
      try { await deleteDoc(doc(db, "teams", state.teamCode, "announcements", action.dataset.id)); toast("Announcement deleted.", "success"); }
      catch (error) { toast(prettyError(error), "error"); }
      break;
  }
});

document.addEventListener("keydown", (event) => {
  const row = event.target.closest?.('.service-row[data-action="open-service"]');
  if (row && event.target === row && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    const service = state.services.find((item) => item.id === row.dataset.id);
    if (service) openService(service);
  }
});

$("#modal").addEventListener("close", () => {
  if (state.chordScrollTimer) clearInterval(state.chordScrollTimer);
  state.chordScrollTimer = null;
  if (state.metronomeTimer) clearInterval(state.metronomeTimer);
  state.metronomeTimer = null;
  state.metronomeContext?.close();
  state.metronomeContext = null;
});

$("#modal").addEventListener("click", (event) => {
  if (event.target === $("#modal")) $("#modal").close();
});

document.addEventListener("input", (event) => {
  if (event.target.id !== "sheet-scroll-speed") return;
  state.sheetScrollSpeed = Number(event.target.value) || 35;
  const output = $("#sheet-scroll-speed-value");
  if (output) output.textContent = `${state.sheetScrollSpeed} px/s`;
});

const redirectResult = getRedirectResult(auth).then(() => null).catch((error) => error);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    state.user = null;
    state.profile = null;
    stopTeamListeners();
    showAuth();
    const redirectError = await redirectResult;
    if (redirectError && !auth.currentUser) setAuthMessage(prettyError(redirectError));
    return;
  }
  await initializeSignedInWorkspace(user);
});
