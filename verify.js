const firebaseConfig = {
  apiKey: "AIzaSyBN8UQq91_5UjlF15zb4V3OB0gHgIOcr3M",
  authDomain: "deo-business-manager.firebaseapp.com",
  projectId: "deo-business-manager",
  storageBucket: "deo-business-manager.firebasestorage.app",
  messagingSenderId: "212595395698",
  appId: "1:212595395698:web:cf08e31c35376d4025c6eb"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const $ = (id) => document.getElementById(id);

function formatUGX(v){
  const n = Number(v || 0);
  try {
    return new Intl.NumberFormat("en-UG",{style:"currency",currency:"UGX",maximumFractionDigits:0}).format(n);
  } catch { return "UGX " + Math.round(n); }
}

function qs(name){ return new URLSearchParams(location.search).get(name); }

(async function(){
  const id = qs("i");
  if(!id){
    $("verifyStatus").textContent = "Missing document ID";
    $("verifyMeta").textContent = "This link is invalid.";
    return;
  }

  try{
    const doc = await db.collection("documents").doc(id).get();
    if(!doc.exists){
      $("verifyStatus").textContent = "NOT FOUND";
      $("verifyStatus").style.color = "#F87171";
      $("verifyMeta").textContent = "This document does not exist in the system.";
      $("verifyDetails").textContent = `Document ID: ${id}`;
      return;
    }

    const d = doc.data() || {};
    $("verifyStatus").textContent = "VERIFIED";
    $("verifyStatus").style.color = "#34D399";

    const created = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : "N/A";
    $("verifyMeta").innerHTML = `
      Document ID: <b>${id}</b><br/>
      Customer: <b>${(d.customerName || "Walk-in")}</b><br/>
      Total: <b>${formatUGX(d.total || 0)}</b><br/>
      Date: <b>${created}</b><br/>
      Status: <b>${(d.status || "finalized")}</b>
    `;

    $("verifyDetails").textContent = JSON.stringify({
      id,
      type: d.type,
      status: d.status,
      customerName: d.customerName,
      paymentStatus: d.paymentStatus,
      paymentMethod: d.paymentMethod,
      subtotal: d.subtotal,
      discount: d.discount,
      tax: d.tax,
      total: d.total
    }, null, 2);
  } catch(e){
    console.error(e);
    $("verifyStatus").textContent = "ERROR";
    $("verifyStatus").style.color = "#FBBF24";
    $("verifyMeta").textContent = "Could not verify now. Try again later.";
    $("verifyDetails").textContent = String(e.message || e);
  }
})();