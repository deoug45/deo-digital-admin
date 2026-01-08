// Deo Digital Admin Portal — app.js (Improved)
// Fixes:
// - Reliable exports (PDF/JPG) using offscreen render (not hidden)
// - Preview buttons for documents + drafts
// - Download Report button
// - Download Quote button (PDF)
// - Drafts are editable (load into New Sale editor)
// - Quote approval is visible and works (Approve/Reject shown in Quotes list)
// - Dashboard updates automatically (realtime listeners trigger recompute)
// - Better A4 export sizing + multipage PDF support (basic)
// - Stamp slogan starts from RIGHT side on the bottom arc

const firebaseConfig = {
  apiKey: "AIzaSyBN8UQq91_5UjlF15zb4V3OB0gHgIOcr3M",
  authDomain: "deo-business-manager.firebaseapp.com",
  projectId: "deo-business-manager",
  storageBucket: "deo-business-manager.firebasestorage.app",
  messagingSenderId: "212595395698",
  appId: "1:212595395698:web:cf08e31c35376d4025c6eb"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

const $ = (id) => document.getElementById(id);

const SECTIONS = [
  "auth",
  "dashboard",
  "documents",
  "newSale",
  "quotes",
  "expenses",
  "capital",
  "clients",
  "drafts",
  "reports",
  "settings"
];

/* --------------------------
   UI helpers
--------------------------- */
function show(sectionId) {
  SECTIONS.forEach((s) => {
    const el = $(s);
    if (!el) return;
    el.classList.toggle("hidden", s !== sectionId);
  });

  document.querySelectorAll(".bottom-nav .nav-btn").forEach((b) =>
    b.classList.toggle("active", b.getAttribute("data-target") === sectionId)
  );

  $("sidebar")?.classList.add("hidden");
}

function toast(msg, ms = 2500) {
  const t = $("toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.add("hidden"), ms);
}

function requireAuth() {
  const u = auth.currentUser;
  if (!u) {
    show("auth");
    throw new Error("Not signed in");
  }
  return u;
}

function formatUGX(v) {
  const n = Number(v || 0);
  try {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      maximumFractionDigits: 0
    }).format(n);
  } catch {
    return "UGX " + Math.round(n);
  }
}

function parseUGX(v) {
  return parseInt(String(v || "0").replace(/,/g, ""), 10) || 0;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* --------------------------
   Navigation / menu
--------------------------- */
// Hamburger or logo toggles sidebar (logo acts as hamburger)
function toggleSidebar() {
  $("sidebar")?.classList.toggle("hidden");
}

$("hamburger")?.addEventListener("click", toggleSidebar);
$("brandLogo")?.addEventListener("click", toggleSidebar);
$("brandLogo")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") toggleSidebar();
});

document.querySelectorAll(".side-btn").forEach((b) =>
  b.addEventListener("click", () => {
    const t = b.getAttribute("data-target");
    if (t) show(t);
  })
);

document.querySelectorAll(".bottom-nav .nav-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    const t = btn.getAttribute("data-target");
    if (t) show(t);
  })
);

/* --------------------------
   Auth
--------------------------- */
$("signInBtn")?.addEventListener("click", async () => {
  try {
    const email = $("email")?.value?.trim();
    const pass = $("password")?.value;
    if (!email || !pass) return toast("Enter email and password.");
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    console.error(e);
    alert("Sign in error: " + e.message);
  }
});

$("signOutBtn")?.addEventListener("click", () => auth.signOut());
$("signOutBtnTop")?.addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    stopRealtime();
    show("auth");
    return;
  }
  $("sbUserLine") && ($("sbUserLine").textContent = user.email || user.uid);
  show("dashboard");
  startRealtime();
});

/* --------------------------
   SALES (New Sale) + Draft edit
--------------------------- */
let saleItems = [];
let editingDraftId = null; // if set, saving draft updates existing draft

$("addItemBtn")?.addEventListener("click", () => {
  const name = $("productName")?.value?.trim() || "";
  if (!name) return toast("Enter product / service.");

  const qty = parseInt($("qty")?.value || "1", 10) || 1;
  const unitPrice = parseUGX($("unitPrice")?.value);
  const costPrice = parseUGX($("costPrice")?.value);

  saleItems.push({ name, qty, unitPrice, costPrice, lineTotal: qty * unitPrice });

  $("productName").value = "";
  $("qty").value = "1";
  $("unitPrice").value = "";
  $("costPrice").value = "";

  renderSaleItems();
});

$("discount")?.addEventListener("input", renderSaleItems);
$("tax")?.addEventListener("input", renderSaleItems);

function computeSaleTotals() {
  const subtotal = saleItems.reduce((s, it) => s + (it.lineTotal || 0), 0);
  const discount = Math.max(0, parseUGX($("discount")?.value));
  const tax = Math.max(0, parseUGX($("tax")?.value));
  const total = Math.max(0, subtotal - discount + tax);
  return { subtotal, discount, tax, total };
}

function renderSaleItems() {
  const list = $("itemsList");
  if (!list) return;
  list.innerHTML = "";

  saleItems.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <b>${escapeHtml(it.name)}</b>
        <div style="opacity:.8;font-size:12px;margin-top:2px">${it.qty} × ${formatUGX(it.unitPrice)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div><b>${formatUGX(it.lineTotal)}</b></div>
        <button class="btn" style="padding:8px 10px" data-remove-item="${idx}" title="Remove">✕</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-remove-item]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = parseInt(b.getAttribute("data-remove-item"), 10);
      saleItems.splice(i, 1);
      renderSaleItems();
    });
  });

  const t = computeSaleTotals();
  $("saleSubtotal") && ($("saleSubtotal").innerText = formatUGX(t.subtotal));
  $("saleDiscount") && ($("saleDiscount").innerText = formatUGX(t.discount));
  $("saleTax") && ($("saleTax").innerText = formatUGX(t.tax));
  $("saleTotal") && ($("saleTotal").innerText = formatUGX(t.total));
}

function resetSaleForm() {
  saleItems = [];
  editingDraftId = null;

  $("saleCustomer") && ($("saleCustomer").value = "");
  $("saleNotes") && ($("saleNotes").value = "");
  $("discount") && ($("discount").value = "");
  $("tax") && ($("tax").value = "");
  $("paymentMethod") && ($("paymentMethod").value = "cash");
  $("paymentStatus") && ($("paymentStatus").value = "paid");

  renderSaleItems();
}

$("saveDraftBtn")?.addEventListener("click", async () => {
  try {
    const user = requireAuth();
    if (!saleItems.length) return toast("Add items first.");

    const totals = computeSaleTotals();
    const draftDoc = {
      type: "sale",
      status: "draft",
      items: saleItems,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      notes: $("saleNotes")?.value || "",
      customerName: $("saleCustomer")?.value || "",
      paymentMethod: $("paymentMethod")?.value || "cash",
      paymentStatus: $("paymentStatus")?.value || "paid",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: user.uid
    };

    if (editingDraftId) {
      // update existing draft
      await db.collection("drafts").doc(editingDraftId).set(draftDoc, { merge: true });
      toast("Draft updated.");
    } else {
      await db.collection("drafts").add(draftDoc);
      toast("Draft saved.");
    }

    resetSaleForm();
    show("drafts");
  } catch (e) {
    console.error(e);
    alert("Save draft failed: " + e.message);
  }
});

$("saveAndPrintBtn")?.addEventListener("click", () => finalizeAndExport("receipt"));
$("saveAndInvoiceBtn")?.addEventListener("click", () => finalizeAndExport("invoice"));

async function finalizeAndExport(kind) {
  try {
    const user = requireAuth();
    if (!saleItems.length) return toast("Add items first.");

    const totals = computeSaleTotals();
    const base = {
      type: "sale",
      status: "finalized",
      items: saleItems,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      notes: $("saleNotes")?.value || "",
      customerName: $("saleCustomer")?.value || "",
      paymentMethod: $("paymentMethod")?.value || "cash",
      paymentStatus: $("paymentStatus")?.value || "paid",
      createdBy: user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection("documents").add(base);
    const id = docRef.id;

    // If we were editing a draft, delete it (paperwork replacement)
    if (editingDraftId) {
      await db.collection("drafts").doc(editingDraftId).delete().catch(() => {});
      editingDraftId = null;
    }

    // Export
    if (kind === "receipt") {
      buildReceiptDOM(base, id);
      await exportJPEG("receiptTemplate", `receipt-${id}.jpg`);
    } else {
      buildInvoiceDOM(base, id);
      await exportA4PDF("invoiceTemplate", `invoice-${id}.pdf`);
    }

    resetSaleForm();
    toast("Finalized and exported.");
    show("documents");
  } catch (e) {
    console.error(e);
    alert("Finalize failed: " + e.message);
  }
}

/* --------------------------
   QUOTES: create + list + approve + download quote
--------------------------- */
let quoteItems = [];
let quoteFilter = "all";
let latestQuotesSnap = null;

$("newQuoteBtn")?.addEventListener("click", () => $("quoteEditor")?.classList.toggle("hidden"));

document.querySelectorAll("[data-quote-filter]").forEach((b) =>
  b.addEventListener("click", () => {
    quoteFilter = b.getAttribute("data-quote-filter") || "all";
    renderQuotesList(latestQuotesSnap);
  })
);

$("addQuoteItemBtn")?.addEventListener("click", () => {
  const name = $("qProductName")?.value?.trim() || "";
  if (!name) return toast("Enter item / service.");

  const qty = parseInt($("qQty")?.value || "1", 10) || 1;
  const unitPrice = parseUGX($("qUnitPrice")?.value);
  const costPrice = parseUGX($("qCostPrice")?.value);

  quoteItems.push({ name, qty, unitPrice, costPrice, lineTotal: qty * unitPrice });

  $("qProductName").value = "";
  $("qQty").value = "1";
  $("qUnitPrice").value = "";
  $("qCostPrice").value = "";

  renderQuoteItems();
});

function renderQuoteItems() {
  const list = $("quoteItemsList");
  if (!list) return;
  list.innerHTML = "";

  let total = 0;
  quoteItems.forEach((it, idx) => {
    total += it.lineTotal || 0;
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <b>${escapeHtml(it.name)}</b>
        <div style="opacity:.8;font-size:12px;margin-top:2px">${it.qty} × ${formatUGX(it.unitPrice)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div><b>${formatUGX(it.lineTotal)}</b></div>
        <button class="btn" style="padding:8px 10px" data-remove-qitem="${idx}">✕</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-remove-qitem]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = parseInt(b.getAttribute("data-remove-qitem"), 10);
      quoteItems.splice(i, 1);
      renderQuoteItems();
    });
  });

  $("quoteTotal") && ($("quoteTotal").innerText = formatUGX(total));
}

$("saveQuoteDraft")?.addEventListener("click", async () => {
  try {
    requireAuth();
    if (!quoteItems.length) return toast("Add items first.");
    const total = quoteItems.reduce((s, x) => s + (x.lineTotal || 0), 0);

    await db.collection("quotes").add({
      type: "quote",
      status: "draft",
      items: quoteItems,
      total,
      notes: $("quoteNotes")?.value || "",
      customerName: $("quoteCustomer")?.value || "",
      validUntil: $("quoteValidUntil")?.value || "",
      currency: $("quoteCurrency")?.value || "UGX",
      createdBy: auth.currentUser?.uid || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    quoteItems = [];
    $("quoteCustomer").value = "";
    $("quoteNotes").value = "";
    renderQuoteItems();
    toast("Quote draft saved.");
  } catch (e) {
    console.error(e);
    alert("Save quote draft failed: " + e.message);
  }
});

$("sendQuoteBtn")?.addEventListener("click", async () => {
  try {
    requireAuth();
    if (!quoteItems.length) return toast("Add items first.");
    const total = quoteItems.reduce((s, x) => s + (x.lineTotal || 0), 0);

    await db.collection("quotes").add({
      type: "quote",
      status: "pending",
      items: quoteItems,
      total,
      notes: $("quoteNotes")?.value || "",
      customerName: $("quoteCustomer")?.value || "",
      validUntil: $("quoteValidUntil")?.value || "",
      currency: $("quoteCurrency")?.value || "UGX",
      createdBy: auth.currentUser?.uid || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    quoteItems = [];
    $("quoteCustomer").value = "";
    $("quoteNotes").value = "";
    renderQuoteItems();
    toast("Quote sent (pending approval).");
  } catch (e) {
    console.error(e);
    alert("Send quote failed: " + e.message);
  }
});

window.approveQuote = async function approveQuote(id) {
  try {
    requireAuth();
    if (!confirm("Approve this quote? It will be converted into a finalized document.")) return;

    const q = await db.collection("quotes").doc(id).get();
    if (!q.exists) return toast("Quote not found.");

    const data = q.data() || {};
    const doc = {
      type: "sale",
      status: "finalized",
      items: data.items || [],
      subtotal: data.total || 0,
      discount: 0,
      tax: 0,
      total: data.total || 0,
      notes: "Converted from quote. " + (data.notes || ""),
      customerName: data.customerName || "",
      paymentMethod: "cash",
      paymentStatus: "unpaid",
      createdBy: auth.currentUser?.uid || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection("documents").add(doc);
    await db.collection("quotes").doc(id).update({
      status: "approved",
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      convertedDocumentId: docRef.id
    });

    toast("Quote approved and converted to invoice.");
    show("documents");
  } catch (e) {
    console.error(e);
    alert("Approve failed: " + e.message);
  }
};

window.rejectQuote = async function rejectQuote(id) {
  try {
    requireAuth();
    if (!confirm("Reject this quote?")) return;
    await db.collection("quotes").doc(id).update({
      status: "rejected",
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast("Quote rejected.");
  } catch (e) {
    console.error(e);
    alert("Reject failed: " + e.message);
  }
};

window.downloadQuotePDF = async function downloadQuotePDF(id) {
  try {
    requireAuth();
    const q = await db.collection("quotes").doc(id).get();
    if (!q.exists) return toast("Quote not found.");
    const data = q.data() || {};
    buildQuoteDOM({ ...data, status: data.status || "pending" }, id);
    await exportA4PDF("quoteTemplate", `quotation-${id}.pdf`);
    toast("Quotation downloaded.");
  } catch (e) {
    console.error(e);
    alert("Download quotation failed: " + e.message);
  }
};

function renderQuotesList(snap) {
  const ul = $("quotesList");
  if (!ul || !snap) return;
  ul.innerHTML = "";

  let pendingCount = 0;

  snap.forEach((doc) => {
    const d = doc.data() || {};
    if (d.status === "pending") pendingCount++;

    if (quoteFilter !== "all" && d.status !== quoteFilter) return;

    const created = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : "";
    const actions =
      d.status === "pending"
        ? `<button onclick="approveQuote('${doc.id}')" class="btn">Approve</button>
           <button onclick="rejectQuote('${doc.id}')" class="btn">Reject</button>`
        : "";

    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <b>${escapeHtml(d.customerName || "Customer")}</b> — <small>${escapeHtml(d.status || "")}</small>
        <br/><small>${escapeHtml(created)}</small>
      </div>
      <div style="text-align:right">
        <div><b>${formatUGX(d.total || 0)}</b></div>
        <div style="margin-top:6px; display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
          <button onclick="previewQuote('${doc.id}')" class="btn">Preview</button>
          <button onclick="downloadQuotePDF('${doc.id}')" class="btn">Download</button>
          ${actions}
        </div>
      </div>
    `;
    ul.appendChild(li);
  });

  $("pendingQuotesCount") && ($("pendingQuotesCount").textContent = String(pendingCount));
}

window.previewQuote = async function previewQuote(id) {
  try {
    requireAuth();
    const q = await db.collection("quotes").doc(id).get();
    if (!q.exists) return toast("Quote not found.");
    const d = q.data() || {};
    buildQuoteDOM(d, id);
    openPreview("quoteTemplate");
  } catch (e) {
    console.error(e);
    toast("Preview failed.");
  }
};

/* --------------------------
   Expenses / Capital (unchanged basic)
--------------------------- */
$("addExpenseBtn")?.addEventListener("click", async () => {
  try {
    requireAuth();
    const vendor = $("expVendor")?.value?.trim() || "";
    const amount = parseUGX($("expAmount")?.value);
    const category = $("expCategory")?.value || "general";
    const notes = $("expNotes")?.value || "";

    if (!vendor || !amount) return toast("Vendor and amount required.");

    let receiptUrl = "";
    const file = $("expReceiptFile")?.files?.[0];
    if (file) {
      const path = `expense_receipts/${auth.currentUser.uid}/${Date.now()}-${file.name}`;
      const ref = storage.ref().child(path);
      await ref.put(file);
      receiptUrl = await ref.getDownloadURL();
    }

    await db.collection("expenses").add({
      vendor, amount, category, notes, receiptUrl,
      date: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser.uid
    });

    $("expVendor").value = "";
    $("expAmount").value = "";
    $("expNotes").value = "";
    if ($("expReceiptFile")) $("expReceiptFile").value = "";
    toast("Expense added.");
  } catch (e) {
    console.error(e);
    alert("Add expense failed: " + e.message);
  }
});

$("addCapitalBtn")?.addEventListener("click", async () => {
  try {
    requireAuth();
    const type = $("capType")?.value || "injection";
    const amount = parseUGX($("capAmount")?.value);
    const notes = $("capNotes")?.value || "";
    if (!amount) return toast("Enter amount.");

    await db.collection("capital_entries").add({
      type, amount, notes,
      date: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser.uid
    });

    $("capAmount").value = "";
    $("capNotes").value = "";
    toast("Capital entry added.");
  } catch (e) {
    console.error(e);
    alert("Add capital failed: " + e.message);
  }
});

/* --------------------------
   Drafts: edit + preview + delete
--------------------------- */
window.editDraft = async function editDraft(draftId) {
  try {
    requireAuth();
    const doc = await db.collection("drafts").doc(draftId).get();
    if (!doc.exists) return toast("Draft not found.");

    const d = doc.data() || {};
    editingDraftId = draftId;
    saleItems = Array.isArray(d.items) ? d.items : [];

    $("saleCustomer") && ($("saleCustomer").value = d.customerName || "");
    $("saleNotes") && ($("saleNotes").value = d.notes || "");
    $("discount") && ($("discount").value = String(d.discount || ""));
    $("tax") && ($("tax").value = String(d.tax || ""));
    $("paymentMethod") && ($("paymentMethod").value = d.paymentMethod || "cash");
    $("paymentStatus") && ($("paymentStatus").value = d.paymentStatus || "paid");

    renderSaleItems();
    show("newSale");
    toast("Draft loaded. Edit then Save Draft or Finalize.");
  } catch (e) {
    console.error(e);
    alert("Edit draft failed: " + e.message);
  }
};

window.previewDraft = async function previewDraft(draftId) {
  try {
    requireAuth();
    const doc = await db.collection("drafts").doc(draftId).get();
    if (!doc.exists) return toast("Draft not found.");

    const d = doc.data() || {};
    // preview as invoice draft (no official number)
    buildInvoiceDOM({ ...d, paymentStatus: d.paymentStatus || "unpaid" }, `DRAFT-${draftId}`);
    openPreview("invoiceTemplate");
  } catch (e) {
    console.error(e);
    toast("Preview draft failed.");
  }
};

window.deleteDraft = async function deleteDraft(draftId) {
  try {
    requireAuth();
    if (!confirm("Delete this draft?")) return;
    await db.collection("drafts").doc(draftId).delete();
    toast("Draft deleted.");
  } catch (e) {
    console.error(e);
    alert("Delete draft failed: " + e.message);
  }
};

/* --------------------------
   Documents: Preview + Download buttons
--------------------------- */
let lastDocumentsCache = [];

$("refreshDocsBtn")?.addEventListener("click", () => refreshDocumentsList(false));
["docSearch", "docTypeFilter", "docFrom", "docTo"].forEach((id) => {
  $(id)?.addEventListener("input", () => refreshDocumentsList(true));
  $(id)?.addEventListener("change", () => refreshDocumentsList(true));
});

async function refreshDocumentsList(useCache = false) {
  try {
    requireAuth();

    if (!useCache || !lastDocumentsCache.length) {
      const snap = await db.collection("documents").orderBy("createdAt", "desc").limit(200).get();
      lastDocumentsCache = [];
      snap.forEach((d) => lastDocumentsCache.push({ id: d.id, ...d.data() }));
    }

    const q = ($("docSearch")?.value || "").trim().toLowerCase();
    const type = $("docTypeFilter")?.value || "all";
    const from = $("docFrom")?.value ? new Date($("docFrom").value) : null;
    const to = $("docTo")?.value ? new Date($("docTo").value + "T23:59:59") : null;

    const ul = $("documentsList");
    if (!ul) return;
    ul.innerHTML = "";

    const filtered = lastDocumentsCache.filter((d) => {
      if (type !== "all" && d.type !== type) return false;
      if (from || to) {
        const dt = d.createdAt?.toDate ? d.createdAt.toDate() : null;
        if (!dt) return false;
        if (from && dt < from) return false;
        if (to && dt > to) return false;
      }
      if (q) {
        const hay = `${d.id || ""} ${d.customerName || ""} ${d.notes || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.forEach((d) => {
      const when = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : "";
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          <b>${escapeHtml(d.id)}</b> — <small>${escapeHtml(when)}</small>
          <br/><small>${escapeHtml(d.customerName || "Customer")} • ${escapeHtml(d.paymentStatus || "")}</small>
        </div>
        <div style="text-align:right">
          <div><b>${formatUGX(d.total || 0)}</b></div>
          <div style="margin-top:6px; display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
            <button class="btn" data-preview-receipt="${escapeHtml(d.id)}">Preview Receipt</button>
            <button class="btn" data-preview-invoice="${escapeHtml(d.id)}">Preview Invoice</button>
            <button class="btn" data-dl-receipt="${escapeHtml(d.id)}">Download Receipt</button>
            <button class="btn" data-dl-invoice="${escapeHtml(d.id)}">Download Invoice</button>
          </div>
        </div>
      `;
      ul.appendChild(li);
    });

    ul.querySelectorAll("[data-preview-receipt]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-preview-receipt");
        const doc = lastDocumentsCache.find((x) => x.id === id);
        if (!doc) return;
        buildReceiptDOM(doc, id);
        openPreview("receiptTemplate");
      });
    });

    ul.querySelectorAll("[data-preview-invoice]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-preview-invoice");
        const doc = lastDocumentsCache.find((x) => x.id === id);
        if (!doc) return;
        buildInvoiceDOM(doc, id);
        openPreview("invoiceTemplate");
      });
    });

    ul.querySelectorAll("[data-dl-receipt]").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.getAttribute("data-dl-receipt");
        const doc = lastDocumentsCache.find((x) => x.id === id);
        if (!doc) return;
        buildReceiptDOM(doc, id);
        await exportJPEG("receiptTemplate", `receipt-${id}.jpg`);
      });
    });

    ul.querySelectorAll("[data-dl-invoice]").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.getAttribute("data-dl-invoice");
        const doc = lastDocumentsCache.find((x) => x.id === id);
        if (!doc) return;
        buildInvoiceDOM(doc, id);
        await exportA4PDF("invoiceTemplate", `invoice-${id}.pdf`);
      });
    });
  } catch (e) {
    console.error(e);
    toast("Could not refresh documents.");
  }
}

/* --------------------------
   Preview modal (simple)
   Uses a new window to show the HTML for preview.
--------------------------- */
function openPreview(templateId) {
  const el = document.getElementById(templateId);
  if (!el) return;

  // Clone HTML for preview
  const html = `
    <!doctype html><html><head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Preview</title>
      <link rel="stylesheet" href="styles.css">
      <style>
        body{background:#0b1220; margin:0; padding:12px;}
        .wrap{display:flex; justify-content:center;}
      </style>
    </head><body>
      <div class="wrap">${el.outerHTML.replace('hidden','')}</div>
    </body></html>
  `;
  const w = window.open("", "_blank");
  if (!w) return toast("Popup blocked. Allow popups for preview.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/* --------------------------
   REPORTS: Better design + Download report button
--------------------------- */
$("runReport")?.addEventListener("click", runReport);
$("exportReportPDF")?.addEventListener("click", downloadReportPDF);
$("exportReportCSV")?.addEventListener("click", downloadReportCSV);

let lastReport = null;

async function runReport() {
  try {
    requireAuth();
    const fromV = $("reportFrom")?.value;
    const toV = $("reportTo")?.value;
    if (!fromV || !toV) return toast("Select report From and To dates.");

    const start = new Date(fromV);
    const end = new Date(toV + "T23:59:59");
    const type = $("reportType")?.value || "summary";

    const res = await computeRange(start, end);
    lastReport = { start, end, type, res };

    renderReportMTNStyle(lastReport);
    toast("Report generated.");
  } catch (e) {
    console.error(e);
    alert("Run report failed: " + e.message);
  }
}

function renderReportMTNStyle(report) {
  const el = $("reportResult");
  if (!el || !report) return;

  const { start, end, type, res } = report;

  el.innerHTML = `
    <div class="report-wrap">
      <div class="report-head">
        <div>
          <div class="report-title">Business Report</div>
          <div class="report-sub">Range: ${start.toLocaleDateString()} → ${end.toLocaleDateString()} • Type: ${escapeHtml(type)}</div>
        </div>
        <div class="report-chip">DEO DIGITAL</div>
      </div>

      <div class="report-grid">
        <div class="report-card blue">
          <div class="k">Revenue</div>
          <div class="v">${formatUGX(res.revenue)}</div>
        </div>
        <div class="report-card green">
          <div class="k">Net Profit</div>
          <div class="v">${formatUGX(res.netProfit)}</div>
        </div>
        <div class="report-card yellow">
          <div class="k">Expenses</div>
          <div class="v">${formatUGX(res.expenses)}</div>
        </div>
        <div class="report-card dark">
          <div class="k">Available Funds</div>
          <div class="v">${formatUGX(res.availableFunds)}</div>
        </div>
      </div>

      <div class="report-section">
        <div class="report-section-title">Breakdown</div>
        <div class="report-lines">
          <div class="line"><span>COGS</span><b>${formatUGX(res.cogs)}</b></div>
          <div class="line"><span>Capital Injected</span><b>${formatUGX(res.injected)}</b></div>
          <div class="line"><span>Capital Withdrawn</span><b>${formatUGX(res.distributed)}</b></div>
          <div class="line"><span>Capital Balance</span><b>${formatUGX(res.capitalBalance)}</b></div>
        </div>
      </div>

      <div class="report-footer-note">
        System-generated report • Deo Digital Admin Portal
      </div>
    </div>
  `;
}

async function downloadReportPDF() {
  try {
    if (!lastReport) return toast("Run a report first.");
    await exportA4PDF("reportResult", "report.pdf", { elementOnly: true });
    toast("Report PDF downloaded.");
  } catch (e) {
    console.error(e);
    toast("Download report PDF failed.");
  }
}

function downloadReportCSV() {
  try {
    if (!lastReport) return toast("Run a report first.");
    const { start, end, type, res } = lastReport;

    const rows = [
      ["Type", type],
      ["From", start.toISOString().slice(0, 10)],
      ["To", end.toISOString().slice(0, 10)],
      ["Revenue", res.revenue],
      ["COGS", res.cogs],
      ["Expenses", res.expenses],
      ["NetProfit", res.netProfit],
      ["Injected", res.injected],
      ["Distributed", res.distributed],
      ["CapitalBalance", res.capitalBalance],
      ["AvailableFunds", res.availableFunds]
    ];

    const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    downloadDataUrl(url, "report.csv");
    toast("Report CSV downloaded.");
  } catch (e) {
    console.error(e);
    toast("Download report CSV failed.");
  }
}

/* --------------------------
   Compute Range (profit & funds)
--------------------------- */
async function computeRange(startDate, endDate) {
  const startTS = firebase.firestore.Timestamp.fromDate(startDate);
  const endTS = firebase.firestore.Timestamp.fromDate(endDate);

  const salesSnap = await db.collection("documents")
    .where("createdAt", ">=", startTS)
    .where("createdAt", "<=", endTS)
    .get();

  let revenue = 0, cogs = 0;
  salesSnap.forEach((d) => {
    const s = d.data() || {};
    revenue += (s.total || 0);
    (s.items || []).forEach((it) => (cogs += (it.costPrice || 0) * (it.qty || 1)));
  });

  const expSnap = await db.collection("expenses")
    .where("date", ">=", startTS)
    .where("date", "<=", endTS)
    .get();

  let expenses = 0;
  expSnap.forEach((d) => (expenses += (d.data()?.amount || 0)));

  const capSnap = await db.collection("capital_entries")
    .where("date", ">=", startTS)
    .where("date", "<=", endTS)
    .get();

  let injected = 0, distributed = 0;
  capSnap.forEach((d) => {
    const c = d.data() || {};
    if (c.type === "injection") injected += (c.amount || 0);
    else distributed += (c.amount || 0);
  });

  const netProfit = revenue - cogs - expenses;
  const capitalBalance = injected - distributed;
  const availableFunds = capitalBalance + netProfit;

  return { revenue, cogs, expenses, injected, distributed, netProfit, capitalBalance, availableFunds };
}

/* --------------------------
   Document DOM Builders (Receipt/Invoice/Quote)
--------------------------- */
function setBadge(el, paid) {
  if (!el) return;
  el.classList.remove("paid", "unpaid");
  el.classList.add(paid ? "paid" : "unpaid");
}

function signatureText() {
  return "Deo Digital";
}

function buildReceiptDOM(data, id) {
  const el = $("receiptTemplate");
  if (!el) return;

  el.querySelector("#rDate").innerText = new Date().toLocaleDateString();
  el.querySelector("#rReceiptNo").innerText = id;
  el.querySelector("#rCustomer").innerText = data.customerName || "Walk-in";
  el.querySelector("#rPayMethod").innerText = (data.paymentMethod || "cash").replace(/_/g, " ");
  el.querySelector("#rNotes").innerText = data.notes || "-";
  $("rAutoSignature") && ($("rAutoSignature").innerText = signatureText());

  const ps = data.paymentStatus || "paid";
  const statusEl = el.querySelector("#rPayStatus");
  statusEl.innerText = ps.toUpperCase();
  setBadge(statusEl, ps === "paid");

  const tbody = el.querySelector("#receiptItems");
  tbody.innerHTML = "";
  (data.items || []).forEach((it) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(it.name)}</td>
      <td>${it.qty}</td>
      <td>pcs</td>
      <td>${formatUGX(it.unitPrice)}</td>
      <td>${formatUGX(it.lineTotal)}</td>
    `;
    tbody.appendChild(tr);
  });

  el.querySelector("#rSubtotal").innerText = formatUGX(data.subtotal || 0);
  el.querySelector("#rDiscount").innerText = formatUGX(data.discount || 0);
  el.querySelector("#rTax").innerText = formatUGX(data.tax || 0);
  el.querySelector("#rTotal").innerText = formatUGX(data.total || 0);

  const stamp = el.querySelector("#stampContainer");
  stamp.innerHTML = "";
  stamp.appendChild(createCurvedStampSVG(false));

  const qr = el.querySelector("#receiptQR");
  qr.innerHTML = "";
  new QRCode(qr, { text: `${location.origin}/verify.html?i=${id}`, width: 90, height: 90 });
}

function buildInvoiceDOM(data, id) {
  const el = $("invoiceTemplate");
  if (!el) return;

  el.querySelector("#invTo").innerText = data.customerName || "Walk-in";
  el.querySelector("#invDate").innerText = new Date().toLocaleDateString();
  el.querySelector("#invNo").innerText = id;
  el.querySelector("#invPayMethod").innerText = (data.paymentMethod || "cash").replace(/_/g, " ");
  el.querySelector("#invNotes").innerText = data.notes || "-";
  $("invAutoSignature") && ($("invAutoSignature").innerText = signatureText());

  const ps = data.paymentStatus || "unpaid";
  const statusEl = el.querySelector("#invPayStatus");
  statusEl.innerText = ps.toUpperCase();
  setBadge(statusEl, ps === "paid");

  const tbody = el.querySelector("#invItems tbody");
  tbody.innerHTML = "";
  (data.items || []).forEach((it) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(it.name)}</td>
      <td>${it.qty}</td>
      <td>pcs</td>
      <td>${formatUGX(it.unitPrice)}</td>
      <td>${formatUGX(it.lineTotal)}</td>
    `;
    tbody.appendChild(tr);
  });

  el.querySelector("#invSubtotal").innerText = formatUGX(data.subtotal || 0);
  el.querySelector("#invDiscount").innerText = formatUGX(data.discount || 0);
  el.querySelector("#invTax").innerText = formatUGX(data.tax || 0);
  el.querySelector("#invTotal").innerText = formatUGX(data.total || 0);

  const stamp = el.querySelector("#invStamp");
  stamp.innerHTML = "";
  stamp.appendChild(createCurvedStampSVG(true));

  const qr = el.querySelector("#invQR");
  qr.innerHTML = "";
  new QRCode(qr, { text: `${location.origin}/verify.html?i=${id}`, width: 80, height: 80 });
}

function buildQuoteDOM(data, id) {
  const el = $("quoteTemplate");
  if (!el) return;

  el.querySelector("#qNo").innerText = id;
  el.querySelector("#qDate").innerText = new Date().toLocaleDateString();
  el.querySelector("#qTo").innerText = data.customerName || "Customer";
  el.querySelector("#qValidUntil").innerText = data.validUntil || "-";
  el.querySelector("#qNotes").innerText = data.notes || "-";
  el.querySelector("#qStatus").innerText = (data.status || "pending").toUpperCase();
  $("qAutoSignature") && ($("qAutoSignature").innerText = signatureText());

  const tbody = el.querySelector("#qItems");
  tbody.innerHTML = "";
  (data.items || []).forEach((it) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(it.name)}</td>
      <td>${it.qty}</td>
      <td>pcs</td>
      <td>${formatUGX(it.unitPrice)}</td>
      <td>${formatUGX(it.lineTotal)}</td>
    `;
    tbody.appendChild(tr);
  });

  el.querySelector("#qTotal").innerText = formatUGX(data.total || 0);

  const stamp = el.querySelector("#qStamp");
  stamp.innerHTML = "";
  stamp.appendChild(createCurvedStampSVG(true));

  const qr = el.querySelector("#qQR");
  qr.innerHTML = "";
  new QRCode(qr, { text: `${location.origin}/verify.html?i=${id}`, width: 80, height: 80 });
}

/* --------------------------
   Stamp SVG (slogan starts from RIGHT)
--------------------------- */
function createCurvedStampSVG(small = false) {
  const size = small ? 90 : 140;
  const svgNS = "http://www.w3.org/2000/svg";
  const xlinkNS = "http://www.w3.org/1999/xlink";
  const uid = "p" + Math.random().toString(16).slice(2);

  const topId = `top_${uid}`;
  const bottomId = `bottom_${uid}`;

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));

  const defs = document.createElementNS(svgNS, "defs");

  const top = document.createElementNS(svgNS, "path");
  top.setAttribute("id", topId);
  top.setAttribute("d", "M30,100 a70,70 0 1,1 140,0");
  defs.appendChild(top);

  // reversed direction for bottom so text starts on the right
  const bottom = document.createElementNS(svgNS, "path");
  bottom.setAttribute("id", bottomId);
  bottom.setAttribute("d", "M170,100 a70,70 0 1,1 -140,0");
  defs.appendChild(bottom);

  svg.appendChild(defs);

  const outer = document.createElementNS(svgNS, "circle");
  outer.setAttribute("cx", "100");
  outer.setAttribute("cy", "100");
  outer.setAttribute("r", "88");
  outer.setAttribute("stroke", "#056FB2");
  outer.setAttribute("stroke-width", "6");
  outer.setAttribute("fill", "none");
  svg.appendChild(outer);

  const topText = document.createElementNS(svgNS, "text");
  topText.setAttribute("font-size", "12");
  topText.setAttribute("fill", "#056FB2");
  topText.setAttribute("font-weight", "900");
  const tp = document.createElementNS(svgNS, "textPath");
  tp.setAttributeNS(xlinkNS, "xlink:href", `#${topId}`);
  tp.setAttribute("startOffset", "50%");
  tp.setAttribute("text-anchor", "middle");
  tp.textContent = "DEO DIGITAL SOLUTIONS";
  topText.appendChild(tp);
  svg.appendChild(topText);

  const bottomText = document.createElementNS(svgNS, "text");
  bottomText.setAttribute("font-size", "10");
  bottomText.setAttribute("fill", "#03AE36");
  const bp = document.createElementNS(svgNS, "textPath");
  bp.setAttributeNS(xlinkNS, "xlink:href", `#${bottomId}`);
  bp.setAttribute("startOffset", "100%");
  bp.setAttribute("text-anchor", "end");
  bp.textContent = "Visualising Your Vision";
  bottomText.appendChild(bp);
  svg.appendChild(bottomText);

  const star = (cx, cy) => {
    const s = document.createElementNS(svgNS, "polygon");
    const r = 6;
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
    }
    s.setAttribute("points", pts.join(" "));
    s.setAttribute("fill", "#03AE36");
    return s;
  };
  svg.appendChild(star(30, 100));
  svg.appendChild(star(170, 100));

  const dateText = document.createElementNS(svgNS, "text");
  dateText.setAttribute("x", "100");
  dateText.setAttribute("y", "106");
  dateText.setAttribute("text-anchor", "middle");
  dateText.setAttribute("font-size", "13");
  dateText.setAttribute("fill", "#0b1220");
  dateText.setAttribute("font-weight", "900");
  dateText.textContent = new Date().toLocaleDateString();
  svg.appendChild(dateText);

  return svg;
}

/* --------------------------
   Export: reliable rendering + A4
--------------------------- */
function ensureOffscreenRender(el) {
  // Must be "rendered" for html2canvas; hidden elements often export blank.
  // We attach to body in an offscreen wrapper.
  const wrap = document.createElement("div");
  wrap.className = "print-stage";
  wrap.style.position = "fixed";
  wrap.style.left = "-10000px";
  wrap.style.top = "0";
  wrap.style.width = "210mm";
  wrap.style.background = "#fff";
  wrap.style.zIndex = "999999";
  wrap.appendChild(el);
  document.body.appendChild(wrap);
  return () => wrap.remove();
}

async function exportJPEG(templateId, filename) {
  const template = document.getElementById(templateId);
  if (!template) throw new Error("Missing template: " + templateId);

  const clone = template.cloneNode(true);
  clone.hidden = false;

  const cleanup = ensureOffscreenRender(clone);
  await delay(150);

  const canvas = await html2canvas(clone, {
    scale: 3,
    backgroundColor: "#fff",
    useCORS: true
  });

  const url = canvas.toDataURL("image/jpeg", 0.96);
  cleanup();

  downloadDataUrl(url, filename);
}

async function exportA4PDF(templateId, filename, opts = {}) {
  const template = document.getElementById(templateId);
  if (!template) throw new Error("Missing template: " + templateId);

  // If exporting reportResult, it might be inside main page; allow element-only export
  const source = opts.elementOnly ? document.getElementById(templateId) : template;

  const clone = source.cloneNode(true);
  clone.hidden = false;

  const cleanup = ensureOffscreenRender(clone);
  await delay(150);

  const canvas = await html2canvas(clone, {
    scale: 3,
    backgroundColor: "#fff",
    useCORS: true
  });

  const imgData = canvas.toDataURL("image/png");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");

  const pageWidth = pdf.internal.pageSize.getWidth();   // 210
  const pageHeight = pdf.internal.pageSize.getHeight(); // 297

  // Calculate dimensions
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  // Multi-page support if content taller than A4
  while (heightLeft > 0) {
    position = position - pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  cleanup();
  pdf.save(filename);
}

/* --------------------------
   Realtime listeners (dashboard updates without refresh)
--------------------------- */
let unsubs = [];
function stopRealtime() {
  unsubs.forEach((fn) => {
    try { fn(); } catch {}
  });
  unsubs = [];
}

let dashboardDebounce = null;
function triggerDashboardRefresh() {
  clearTimeout(dashboardDebounce);
  dashboardDebounce = setTimeout(() => {
    // quick update just for counts and cached docs refresh
    refreshDocumentsList(true);
  }, 250);
}

function startRealtime() {
  stopRealtime();

  // documents
  unsubs.push(
    db.collection("documents").orderBy("createdAt", "desc").limit(12).onSnapshot((snap) => {
      const ul = $("recentSales");
      if (ul) ul.innerHTML = "";
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const when = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : "";
        const li = document.createElement("li");
        li.innerHTML = `
          <div>
            <b>${escapeHtml(d.customerName || "Customer")}</b> — <small>${escapeHtml(when)}</small>
            <br/><small>${escapeHtml(d.paymentStatus || "")} • ${escapeHtml(d.paymentMethod || "")}</small>
          </div>
          <div><b>${formatUGX(d.total || 0)}</b></div>
        `;
        ul?.appendChild(li);
      });
      triggerDashboardRefresh();
    })
  );

  // quotes
  unsubs.push(
    db.collection("quotes").orderBy("createdAt", "desc").onSnapshot((snap) => {
      latestQuotesSnap = snap;
      renderQuotesList(snap);
      triggerDashboardRefresh();
    })
  );

  // drafts
  unsubs.push(
    db.collection("drafts").orderBy("updatedAt", "desc").onSnapshot((snap) => {
      const ul = $("draftsList");
      if (ul) ul.innerHTML = "";
      let count = 0;
      snap.forEach((doc) => {
        count++;
        const d = doc.data() || {};
        const when = d.updatedAt?.toDate ? d.updatedAt.toDate().toLocaleString() : "";
        const li = document.createElement("li");
        li.innerHTML = `
          <div>
            <b>${escapeHtml(d.customerName || "Draft")}</b> — <small>${escapeHtml(when)}</small>
            <br/><small>${escapeHtml(d.notes || "")}</small>
          </div>
          <div style="text-align:right">
            <div><b>${formatUGX(d.total || 0)}</b></div>
            <div style="margin-top:6px; display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
              <button class="btn" onclick="editDraft('${doc.id}')">Edit</button>
              <button class="btn" onclick="previewDraft('${doc.id}')">Preview</button>
              <button class="btn" onclick="deleteDraft('${doc.id}')">Delete</button>
            </div>
          </div>
        `;
        ul?.appendChild(li);
      });
      $("draftCount") && ($("draftCount").textContent = String(count));
      triggerDashboardRefresh();
    })
  );

  // expenses
  unsubs.push(
    db.collection("expenses").orderBy("date", "desc").onSnapshot((snap) => {
      const ul = $("expensesList");
      if (ul) ul.innerHTML = "";
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const when = d.date?.toDate ? d.date.toDate().toLocaleString() : "";
        const li = document.createElement("li");
        li.innerHTML = `
          <div>
            <b>${escapeHtml(d.vendor || "")}</b> — <small>${escapeHtml(d.category || "general")}</small>
            <br/><small>${escapeHtml(d.notes || "")}</small>
            <br/><small>${escapeHtml(when)}</small>
          </div>
          <div><b>${formatUGX(d.amount || 0)}</b></div>
        `;
        ul?.appendChild(li);
      });
      triggerDashboardRefresh();
    })
  );

  // capital
  unsubs.push(
    db.collection("capital_entries").orderBy("date", "desc").onSnapshot((snap) => {
      const ul = $("capitalList");
      if (ul) ul.innerHTML = "";
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const when = d.date?.toDate ? d.date.toDate().toLocaleString() : "";
        const li = document.createElement("li");
        li.innerHTML = `
          <div>
            <b>${escapeHtml(d.type || "")}</b>
            <br/><small>${escapeHtml(d.notes || "")}</small>
            <br/><small>${escapeHtml(when)}</small>
          </div>
          <div><b>${formatUGX(d.amount || 0)}</b></div>
        `;
        ul?.appendChild(li);
      });
      triggerDashboardRefresh();
    })
  );

  // first documents list load
  refreshDocumentsList(false);
}

console.log("App initialized — improved exports, previews, drafts edit, quote downloads.");

// NOTE: client / settings listeners can be added like before if needed.