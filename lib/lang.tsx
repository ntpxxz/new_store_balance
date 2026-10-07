"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "th";

export type Translations = {
  nav: { home: string; receive: string; parts: string; iqc: string; track: string; bin: string; subtitle: string };
  as400: { title: string; desc: string; items: (n: number) => string; waiting: string; confirm: string; cancel: string };
  common: { loading: string; cancel: string; search: string; items: (n: number) => string; viewDetail: string; detail: string; inspect: string; syncDone: string; syncFailed: string };
  login: { subtitle: string; username: string; password: string; signin: string; signingIn: string };
  receive: {
    title: string; tabPending: string; tabIqc: string; tabDone: string; searchPh: string;
    syncRange: string; syncing: string; foundN: (n: number) => string; noPending: string;
    noItems: string; colId: string; colPartNo: string; colPartName: string; colVendor: string;
    colPo: string; colDate: string; colInvRcv: string; colQty: string; colActions: string; rcv: string;
  };
  parts: {
    title: string; searchPh: string; criticalOnly: string; syncing: string;
    synced: (p: number, s: number) => string; noCritical: string; noFound: string;
    nParts: (n: number) => string; belowSafety: string; safety: string; loc: string;
    colPartNo: string; colName: string; colDivision: string; colUnit: string;
    colSafety: string; colOnHand: string; colLocations: string;
  };
  iqc: { title: string; searchPh: string; noItems: string; nWaiting: (n: number) => string; pcs: string };
  track: {
    title: string; searchPh: string; filterAll: string; filterPending: string; filterIqc: string;
    filterDone: string; noTasks: string; colStatus: string; colInvoice: string; colPartNo: string;
    colPartName: string; colVendor: string; colPlan: string; colActual: string;
    colInvDate: string; colReceived: string; qty: string; rcv: string;
  };
  bin: {
    title: string; searchPh: string; noRows: string;
    colLocation: string; colPartNo: string; colPartName: string;
    colVendor: string; colQty: string; colUpdated: string;
  };
  card: { taxInv: string; vendor: string; invoice: string };
};

const T: Record<Lang, Translations> = {
  en: {
    nav: { home: "Home", receive: "Receive", parts: "Parts", iqc: "IQC", track: "Track", bin: "Bin", subtitle: "Main Warehouse" },
    as400: {
      title: "AS400 Pending Confirm",
      desc: "RPA has filled all data — please verify the screen and confirm",
      items: (n) => `${n} items`,
      waiting: "Waiting for AS400 screen…",
      confirm: "Confirm (Enter)",
      cancel: "Cancel (F3)",
    },
    common: {
      loading: "Loading…", cancel: "Cancel", search: "Search",
      items: (n) => `${n} item${n !== 1 ? "s" : ""}`,
      viewDetail: "view detail", detail: "detail", inspect: "Inspect",
      syncDone: "Sync Complete", syncFailed: "Sync Failed",
    },
    login: { subtitle: "Receive Module — sign in", username: "Username", password: "Password", signin: "Sign in", signingIn: "Signing in…" },
    receive: {
      title: "Receive", tabPending: "Pending", tabIqc: "IQC", tabDone: "Done",
      searchPh: "Search invoice or vendor…", syncRange: "Sync range:", syncing: "Syncing…",
      foundN: (n) => `Found ${n} invoice(s) in DB`,
      noPending: "No pending items.", noItems: "No items in this tab.",
      colId: "Inbound ID", colPartNo: "Part No.", colPartName: "Part Name",
      colVendor: "Vendor Code", colPo: "PO Number", colDate: "Date",
      colInvRcv: "Invoice / Received", colQty: "Qty", colActions: "Actions", rcv: "Rcv:",
    },
    parts: {
      title: "Parts", searchPh: "Part no, part name…", criticalOnly: "Critical only",
      syncing: "Syncing stock…", synced: (p, s) => `Synced ${p} parts · ${s} stock locations`,
      noCritical: "No parts below safety stock.", noFound: "No parts found.",
      nParts: (n) => `${n} part${n !== 1 ? "s" : ""}`, belowSafety: "below safety stock",
      safety: "Safety:", loc: "Loc:",
      colPartNo: "Part No.", colName: "Name", colDivision: "Division", colUnit: "Unit",
      colSafety: "Safety Stock", colOnHand: "On Hand", colLocations: "Locations",
    },
    iqc: { title: "IQC Queue", searchPh: "Search part, invoice, vendor…", noItems: "No items waiting for IQC — all clear.", nWaiting: (n) => `${n} item${n !== 1 ? "s" : ""} waiting`, pcs: "pcs" },
    track: {
      title: "Warehouse Tracker", searchPh: "Search invoice, part, vendor…",
      filterAll: "All", filterPending: "Pending / Arrived", filterIqc: "IQC", filterDone: "Done",
      noTasks: "No tasks found.", colStatus: "Status", colInvoice: "Invoice",
      colPartNo: "Part No.", colPartName: "Part Name", colVendor: "Vendor",
      colPlan: "Plan Qty", colActual: "Actual", colInvDate: "Invoice Date",
      colReceived: "Received", qty: "Qty:", rcv: "Rcv:",
    },
    bin: {
      title: "Bin Tracker", searchPh: "Part no, part name, or bin…", noRows: "No stock found.",
      colLocation: "Location", colPartNo: "Part No.", colPartName: "Part Name",
      colVendor: "Vendor", colQty: "Qty", colUpdated: "Updated",
    },
    card: { taxInv: "DO No", vendor: "Vendor:", invoice: "Invoice" },
  },
  th: {
    nav: { home: "หน้าหลัก", receive: "รับสินค้า", parts: "ชิ้นส่วน", iqc: "IQC", track: "ติดตาม", bin: "Bin", subtitle: "คลังสินค้าหลัก" },
    as400: {
      title: "AS400 รอยืนยัน",
      desc: "RPA กรอกข้อมูลครบแล้ว — กรุณาตรวจสอบหน้าจอแล้วกดยืนยัน",
      items: (n) => `${n} รายการ`,
      waiting: "รอหน้าจอ AS400…",
      confirm: "ยืนยัน (Enter)",
      cancel: "ยกเลิก (F3)",
    },
    common: {
      loading: "กำลังโหลด…", cancel: "ยกเลิก", search: "ค้นหา",
      items: (n) => `${n} รายการ`,
      viewDetail: "ดูรายละเอียด", detail: "รายละเอียด", inspect: "ตรวจสอบ",
      syncDone: "ซิงค์สำเร็จ", syncFailed: "ซิงค์ล้มเหลว",
    },
    login: { subtitle: "โมดูลรับสินค้า — เข้าสู่ระบบ", username: "ชื่อผู้ใช้", password: "รหัสผ่าน", signin: "เข้าสู่ระบบ", signingIn: "กำลังเข้าสู่ระบบ…" },
    receive: {
      title: "รับสินค้า", tabPending: "รอรับ", tabIqc: "IQC", tabDone: "เสร็จสิ้น",
      searchPh: "ค้นหาใบแจ้งหนี้หรือผู้จัดจำหน่าย…", syncRange: "ช่วงเวลาซิงค์:", syncing: "กำลังซิงค์…",
      foundN: (n) => `พบ ${n} ใบแจ้งหนี้ในฐานข้อมูล`,
      noPending: "ไม่มีรายการรอดำเนินการ", noItems: "ไม่มีรายการในแท็บนี้",
      colId: "รหัสนำเข้า", colPartNo: "รหัสชิ้นส่วน", colPartName: "ชื่อชิ้นส่วน",
      colVendor: "รหัสผู้จัดจำหน่าย", colPo: "เลขที่ PO", colDate: "วันที่",
      colInvRcv: "ใบแจ้งหนี้ / รับแล้ว", colQty: "จำนวน", colActions: "จัดการ", rcv: "รับ:",
    },
    parts: {
      title: "ชิ้นส่วน", searchPh: "รหัสชิ้นส่วน, ชื่อชิ้นส่วน…", criticalOnly: "วิกฤตเท่านั้น",
      syncing: "กำลังซิงค์สต็อก…", synced: (p, s) => `ซิงค์ ${p} ชิ้นส่วน · ${s} ตำแหน่งสต็อก`,
      noCritical: "ไม่มีชิ้นส่วนต่ำกว่าสต็อกขั้นต่ำ", noFound: "ไม่พบชิ้นส่วน",
      nParts: (n) => `${n} ชิ้นส่วน`, belowSafety: "ต่ำกว่าสต็อกขั้นต่ำ",
      safety: "ขั้นต่ำ:", loc: "ที่เก็บ:",
      colPartNo: "รหัสชิ้นส่วน", colName: "ชื่อ", colDivision: "หน่วยงาน", colUnit: "หน่วย",
      colSafety: "สต็อกขั้นต่ำ", colOnHand: "คงเหลือ", colLocations: "ตำแหน่ง",
    },
    iqc: { title: "คิว IQC", searchPh: "ค้นหาชิ้นส่วน, ใบแจ้งหนี้, ผู้จัดจำหน่าย…", noItems: "ไม่มีรายการรอตรวจสอบ IQC", nWaiting: (n) => `${n} รายการรอ`, pcs: "ชิ้น" },
    track: {
      title: "ติดตามสินค้า", searchPh: "ค้นหาใบแจ้งหนี้, ชิ้นส่วน, ผู้จัดจำหน่าย…",
      filterAll: "ทั้งหมด", filterPending: "รอรับ / รับแล้ว", filterIqc: "IQC", filterDone: "เสร็จสิ้น",
      noTasks: "ไม่พบรายการ", colStatus: "สถานะ", colInvoice: "ใบแจ้งหนี้",
      colPartNo: "รหัสชิ้นส่วน", colPartName: "ชื่อชิ้นส่วน", colVendor: "ผู้จัดจำหน่าย",
      colPlan: "จำนวนแผน", colActual: "รับจริง", colInvDate: "วันที่ใบแจ้งหนี้",
      colReceived: "วันที่รับ", qty: "จำนวน:", rcv: "รับ:",
    },
    bin: {
      title: "ติดตามถังสินค้า", searchPh: "รหัสชิ้นส่วน, ชื่อ หรือ bin…", noRows: "ไม่พบสต็อก",
      colLocation: "ตำแหน่ง", colPartNo: "รหัสชิ้นส่วน", colPartName: "ชื่อชิ้นส่วน",
      colVendor: "ผู้จัดจำหน่าย", colQty: "จำนวน", colUpdated: "อัปเดต",
    },
    card: { taxInv: "DO No", vendor: "ผู้จัดจำหน่าย:", invoice: "ใบแจ้งหนี้" },
  },
};

const LangContext = createContext<{ t: Translations; lang: Lang; setLang: (l: Lang) => void }>({
  t: T.en, lang: "en", setLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("th");

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "th") setLangState(saved);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem("lang", l);
  }

  return <LangContext.Provider value={{ t: T[lang], lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
