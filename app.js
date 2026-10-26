(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const form = $("message-form"), messageInput = $("message"), charCount = $("char-count");
  const formStatus = $("form-status"), sendButton = $("send-button");
  const list = $("messages-list"), count = $("message-count"), loadMore = $("load-more");
  const reportDialog = $("report-dialog"), reportForm = $("report-form");
  $("year").textContent = new Date().getFullYear();

  let db = null, lastDoc = null, loading = false, hasMore = true;
  const PAGE_SIZE = 8;
  const config = window.FIREBASE_CONFIG;
  const configured = config && config.apiKey && !config.apiKey.startsWith("PASTE_") &&
    config.projectId && !config.projectId.startsWith("YOUR_");

  function status(el, text, error = false) {
    el.textContent = text;
    el.classList.toggle("error", error);
  }
  function safeDate(value) {
    try {
      const d = value && value.toDate ? value.toDate() : new Date(value);
      if (Number.isNaN(d.getTime())) return "رسالة مجهولة";
      return new Intl.DateTimeFormat("ar", { dateStyle: "medium" }).format(d);
    } catch { return "رسالة مجهولة"; }
  }
  function showSetupState() {
    list.innerHTML = '<div class="empty-state">الموقع جاهز للربط، لكن قاعدة Firebase لم تُضبط بعد.<br>أضف إعدادات مشروعك في ملف <b>firebase-config.js</b> ثم انشر التغييرات.</div>';
    count.textContent = "بانتظار الإعداد";
    status(formStatus, "الموقع غير متصل بقاعدة البيانات بعد.", true);
    sendButton.disabled = true;
    sendButton.style.opacity = ".55";
  }
  function renderMessage(doc) {
    const data = doc.data();
    const article = document.createElement("article");
    article.className = "message-card";
    const p = document.createElement("p");
    p.className = "message-text";
    p.textContent = data.text || "";
    const foot = document.createElement("div");
    foot.className = "message-foot";
    const date = document.createElement("span");
    date.textContent = safeDate(data.publishedAt || data.createdAt);
    const report = document.createElement("button");
    report.type = "button"; report.className = "report-btn"; report.textContent = "الإبلاغ عن الرسالة";
    report.addEventListener("click", () => openReport(doc.id));
    foot.append(date, report);
    article.append(p, foot);
    return article;
  }
  async function loadMessages(reset = false) {
    if (!db || loading || (!hasMore && !reset)) return;
    loading = true;
    if (reset) { lastDoc = null; hasMore = true; list.replaceChildren(); list.innerHTML = '<div class="empty-state"><span class="loader"></span><p>عم نفتّش عن الرسائل المنشورة…</p></div>'; }
    try {
      let q = db.collection("messages").where("status", "==", "approved")
        .orderBy("publishedAt", "desc").limit(PAGE_SIZE);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      if (reset) list.replaceChildren();
      if (snap.empty && !lastDoc) {
        list.innerHTML = '<div class="empty-state">لسّا ما في رسائل منشورة. يمكن رسالتك تكون أول أثر هون.</div>';
      } else {
        snap.docs.forEach(doc => list.appendChild(renderMessage(doc)));
      }
      if (!snap.empty) lastDoc = snap.docs[snap.docs.length - 1];
      hasMore = snap.docs.length === PAGE_SIZE;
      loadMore.classList.toggle("hidden", !hasMore);
      count.textContent = `${list.querySelectorAll(".message-card").length}${hasMore ? "+" : ""} رسالة`;
    } catch (e) {
      console.error("Could not load approved messages", e);
      list.innerHTML = '<div class="empty-state">ما قدرنا نحمّل الرسائل حاليًا. تأكد من إعدادات Firebase وقواعد Firestore ثم جرّب مجددًا.</div>';
    } finally { loading = false; }
  }
  function openReport(id) {
    $("report-message-id").value = id;
    $("report-reason").value = "";
    $("report-details").value = "";
    status($("report-status"), "");
    reportDialog.showModal();
  }
  $("close-report").addEventListener("click", () => reportDialog.close());
  reportDialog.addEventListener("click", (e) => { if (e.target === reportDialog) reportDialog.close(); });

  messageInput.addEventListener("input", () => { charCount.textContent = `${messageInput.value.length} / 1000`; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!db) return status(formStatus, "قاعدة البيانات غير متصلة بعد.", true);
    const text = messageInput.value.trim();
    if (text.length < 3 || text.length > 1000) return status(formStatus, "اكتب رسالة بين 3 و1000 حرف.", true);
    if (!$("consent").checked) return status(formStatus, "يرجى الموافقة على بقاء الرسالة قيد المراجعة.", true);
    sendButton.disabled = true;
    status(formStatus, "عم نرسل رسالتك للمراجعة…");
    try {
      await db.collection("messages").add({
        text,
        status: "pending",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      form.reset(); charCount.textContent = "0 / 1000";
      status(formStatus, "وصلت رسالتك بنجاح، وستبقى مخفية إلى أن يراجعها صاحب الموقع.");
    } catch (err) {
      console.error("Message submission failed", err);
      status(formStatus, "تعذّر إرسال الرسالة. حاول لاحقًا.", true);
    } finally { sendButton.disabled = false; }
  });

  reportForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!db) return status($("report-status"), "قاعدة البيانات غير متصلة.", true);
    const messageId = $("report-message-id").value;
    const reason = $("report-reason").value;
    const details = $("report-details").value.trim();
    if (!messageId || !reason) return status($("report-status"), "اختر سبب الإبلاغ.", true);
    const submit = reportForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    status($("report-status"), "عم نرسل البلاغ…");
    try {
      await db.collection("reports").add({
        messageId, reason, details,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: "new"
      });
      status($("report-status"), "وصل البلاغ، شكرًا لمساعدتنا في الحفاظ على المساحة.");
      setTimeout(() => reportDialog.close(), 1200);
    } catch (err) {
      console.error("Report submission failed", err);
      status($("report-status"), "تعذّر إرسال البلاغ. حاول لاحقًا.", true);
    } finally { submit.disabled = false; }
  });
  loadMore.addEventListener("click", () => loadMessages(false));

  if (!configured || !window.firebase) { showSetupState(); return; }
  try {
    firebase.initializeApp(config);
    db = firebase.firestore();
    loadMessages(true);
  } catch (e) {
    console.error(e);
    showSetupState();
  }
})();