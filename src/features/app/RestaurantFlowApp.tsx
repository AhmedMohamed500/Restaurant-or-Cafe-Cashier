"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { db } from "@/src/db/database";
import { ensureEmptyWorkspace, resetAllData } from "@/src/db/seed";
import { ensureDefaultAccountingSetup } from "@/src/domain/accounting-service";
import { addOpeningStock, completeSale, executeProduction, saveProductionDefinition, transferToKitchen } from "@/src/domain/inventory-service";
import type { AccountingAccount, AppSettings, AttendanceRecord, AuditLog, CashAccount, CashierShift, CashTransfer, Employee, InventoryItem, JournalEntry, JournalLine, OperationalAlert, OrderItem, PayrollRecord, ProductionOrder, PurchaseInvoice, PurchaseInvoiceLine, Recipe, RestaurantExpense, SaleOrder, ShiftCashMovement, StockBalance, StockCount, StockCountLine, StockMovement, Supplier, SupplierPayment, UnitOfMeasure, Warehouse, WasteEntry } from "@/src/domain/models";
import { formatMoney, formatQuantity } from "@/src/lib/money";
import { hashPassword } from "@/src/lib/auth";
import { FinanceModule } from "@/src/features/finance/FinanceModule";
import { OperationsControlModule } from "@/src/features/operations/OperationsControlModule";

type WorkflowSection = "inventory" | "kitchen" | "production" | "finished" | "pos";
type Section = WorkflowSection | "control" | "accounts" | "hr";
type ModalName = "receipt" | "transfer" | "production" | "settings" | "expense" | "employee" | "attendance" | "payroll" | null;

const navItems: { id: WorkflowSection; icon: string; label: string; eyebrow: string; description: string }[] = [
  { id: "inventory", icon: "▦", label: "المخزون", eyebrow: "الخطوة 1 من 5", description: "أضف مشترياتك إلى المخزن الرئيسي بوحدتها وتكلفتها الفعلية." },
  { id: "kitchen", icon: "⇄", label: "المطبخ", eyebrow: "الخطوة 2 من 5", description: "حوّل المواد من المخزن إلى المطبخ لتصبح جاهزة للتصنيع." },
  { id: "production", icon: "⚙", label: "التصنيع", eyebrow: "الخطوة 3 من 5", description: "استهلك مواد المطبخ وأنتج منتجًا تامًا في عملية ذرية واحدة." },
  { id: "finished", icon: "✓", label: "المنتج التام", eyebrow: "الخطوة 4 من 5", description: "راجع المنتجات الجاهزة وتكلفتها وربحها وسعر بيعها." },
  { id: "pos", icon: "▤", label: "الكاشير", eyebrow: "الخطوة 5 من 5", description: "بع من رصيد المنتج التام فقط واطبع إيصال العميل." },
];

const managementItems: { id: Section; icon: string; label: string; eyebrow: string; description: string }[] = [
  { id: "control", icon: "⌁", label: "الرقابة والتشغيل", eyebrow: "لوحة تحكم المالك", description: "راقب الورديات والنقدية والجرد والهالك وتكلفة الطعام والتنبيهات من مكان واحد." },
  { id: "accounts", icon: "ج", label: "الحسابات", eyebrow: "الإدارة المالية", description: "تابع المبيعات وتكلفة المبيعات والمصروفات والربحية وطرق التحصيل." },
  { id: "hr", icon: "♟", label: "الموارد البشرية", eyebrow: "إدارة فريق العمل", description: "سجّل الموظفين والحضور والانصراف والرواتب والسلف والخصومات." },
];
const allNavItems = [...navItems, ...managementItems];

const movementLabels: Record<string, string> = {
  opening: "رصيد قديم", purchase: "مشتريات", stock_receipt: "إذن إضافة",
  transfer_to_kitchen_out: "تحويل للمطبخ — صرف", transfer_to_kitchen_in: "تحويل للمطبخ — استلام",
  production_consume: "صرف تصنيع", production_output: "ناتج تصنيع", sale: "بيع قديم",
  finished_product_sale: "بيع منتج تام", adjustment: "تسوية", waste: "هالك",
};

interface AppData {
  units: UnitOfMeasure[];
  items: InventoryItem[];
  warehouses: Warehouse[];
  balances: StockBalance[];
  recipes: Recipe[];
  movements: StockMovement[];
  productionOrders: ProductionOrder[];
  saleOrders: SaleOrder[];
  expenses: RestaurantExpense[];
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  payrollRecords: PayrollRecord[];
  accounts: AccountingAccount[];
  journalEntries: JournalEntry[];
  journalLines: JournalLine[];
  suppliers: Supplier[];
  purchaseInvoices: PurchaseInvoice[];
  purchaseInvoiceLines: PurchaseInvoiceLine[];
  supplierPayments: SupplierPayment[];
  cashAccounts: CashAccount[];
  cashTransfers: CashTransfer[];
  shifts: CashierShift[];
  shiftCashMovements: ShiftCashMovement[];
  stockCounts: StockCount[];
  stockCountLines: StockCountLine[];
  wasteEntries: WasteEntry[];
  auditLogs: AuditLog[];
  alerts: OperationalAlert[];
  settings?: AppSettings;
}

const emptyData: AppData = { units: [], items: [], warehouses: [], balances: [], recipes: [], movements: [], productionOrders: [], saleOrders: [], expenses: [], employees: [], attendanceRecords: [], payrollRecords: [], accounts: [], journalEntries: [], journalLines: [], suppliers: [], purchaseInvoices: [], purchaseInvoiceLines: [], supplierPayments: [], cashAccounts: [], cashTransfers: [], shifts: [], shiftCashMovements: [], stockCounts: [], stockCountLines: [], wasteEntries: [], auditLogs: [], alerts: [] };
const AUTH_SESSION_KEY = "restaurantflow-authenticated";
const PRODUCTION_UNIT_CODES = ["KG", "G", "COUNT"] as const;

function productionUnitOptions(data: AppData, item?: InventoryItem) {
  const itemFamily = data.units.find((unit) => unit.id === item?.baseUnitId)?.family;
  return PRODUCTION_UNIT_CODES.flatMap((code) => {
    const unit = data.units.find((entry) => entry.code.toUpperCase() === code);
    return unit ? [{ unit, compatible: unit.family === itemFamily }] : [];
  });
}

function defaultProductionUnitId(data: AppData, item?: InventoryItem) {
  const options = productionUnitOptions(data, item);
  const preferredCode = data.units.find((unit) => unit.id === item?.baseUnitId)?.family === "mass" ? "G" : "COUNT";
  return options.find((entry) => entry.compatible && entry.unit.code.toUpperCase() === preferredCode)?.unit.id ?? options.find((entry) => entry.compatible)?.unit.id ?? item?.baseUnitId ?? "";
}

async function optimizeItemImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("اختر ملف صورة صالحًا");
  if (file.size > 8 * 1024 * 1024) throw new Error("حجم الصورة يجب ألا يتجاوز 8 ميجابايت");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element); element.onerror = () => reject(new Error("تعذر قراءة الصورة")); element.src = sourceUrl;
    });
    const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("تعذر تجهيز الصورة");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.82);
  } finally { URL.revokeObjectURL(sourceUrl); }
}

function ItemImage({ item, fallback = "🍽️", large = false }: { item?: InventoryItem; fallback?: string; large?: boolean }) {
  return <span className={`item-image ${large ? "large" : ""}`}>{item?.imageDataUrl ? <Image src={item.imageDataUrl} alt={`صورة ${item.nameAr}`} width={large ? 420 : 84} height={large ? 300 : 84} unoptimized /> : <span aria-hidden="true">{fallback}</span>}</span>;
}

function BrandLogo({ settings, large = false }: { settings?: AppSettings; large?: boolean }) {
  const letter = (settings?.restaurantName || "RestaurantFlow").trim().slice(0, 1).toUpperCase() || "R";
  return <div className={`brand-mark ${large ? "auth-logo" : ""}`}>{settings?.logoDataUrl ? <Image src={settings.logoDataUrl} alt={`شعار ${settings.restaurantName}`} width={large ? 120 : 64} height={large ? 120 : 64} unoptimized /> : letter}</div>;
}

export function RestaurantFlowApp() {
  const [section, setSection] = useState<Section>("inventory");
  const [modal, setModal] = useState<ModalName>(null);
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [payment, setPayment] = useState<"cash" | "card" | "wallet">("cash");
  const [authenticated, setAuthenticated] = useState(false);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error }); window.setTimeout(() => setToast(null), 3800);
  }, []);
  const refresh = useCallback(async () => {
    const [units, items, warehouses, balances, recipes, movements, productionOrders, saleOrders, expenses, employees, attendanceRecords, payrollRecords, accounts, journalEntries, journalLines, suppliers, purchaseInvoices, purchaseInvoiceLines, supplierPayments, cashAccounts, cashTransfers, shifts, shiftCashMovements, stockCounts, stockCountLines, wasteEntries, auditLogs, alerts, settings] = await Promise.all([
      db.units.toArray(), db.items.toArray(), db.warehouses.toArray(), db.balances.toArray(), db.recipes.toArray(),
      db.movements.orderBy("createdAt").reverse().toArray(), db.productionOrders.orderBy("createdAt").reverse().toArray(),
      db.saleOrders.orderBy("createdAt").reverse().toArray(), db.expenses.orderBy("expenseDate").reverse().toArray(),
      db.employees.toArray(), db.attendanceRecords.orderBy("workDate").reverse().toArray(), db.payrollRecords.orderBy("month").reverse().toArray(),
      db.accounts.orderBy("code").toArray(), db.journalEntries.orderBy("date").reverse().toArray(), db.journalLines.toArray(), db.suppliers.orderBy("name").toArray(), db.purchaseInvoices.orderBy("date").reverse().toArray(), db.purchaseInvoiceLines.toArray(), db.supplierPayments.orderBy("date").reverse().toArray(), db.cashAccounts.toArray(), db.cashTransfers.orderBy("date").reverse().toArray(), db.shifts.orderBy("openedAt").reverse().toArray(), db.shiftCashMovements.orderBy("occurredAt").reverse().toArray(), db.stockCounts.orderBy("createdAt").reverse().toArray(), db.stockCountLines.toArray(), db.wasteEntries.orderBy("occurredAt").reverse().toArray(), db.auditLogs.orderBy("timestamp").reverse().toArray(), db.alerts.orderBy("createdAt").reverse().toArray(), db.settings.get("settings"),
    ]);
    setData({ units, items, warehouses, balances, recipes, movements, productionOrders, saleOrders, expenses, employees, attendanceRecords, payrollRecords, accounts, journalEntries, journalLines, suppliers, purchaseInvoices, purchaseInvoiceLines, supplierPayments, cashAccounts, cashTransfers, shifts, shiftCashMovements, stockCounts, stockCountLines, wasteEntries, auditLogs, alerts, settings });
  }, []);
  useEffect(() => {
    ensureEmptyWorkspace().then(ensureDefaultAccountingSetup).then(refresh).then(async () => {
      const settings = await db.settings.get("settings");
      setAuthenticated(Boolean(settings?.passwordHash && sessionStorage.getItem(AUTH_SESSION_KEY) === "1"));
      setReady(true);
    }).catch((error) => notify(error.message, true));
  }, [notify, refresh]);

  const activeNav = allNavItems.find((item) => item.id === section)!;
  const isWorkflowSection = navItems.some((item) => item.id === section);
  const goNext = () => { const index = navItems.findIndex((item) => item.id === section); if (index >= 0) setSection(navItems[Math.min(navItems.length - 1, index + 1)].id); };
  const reset = async () => {
    if (!window.confirm("سيتم حذف جميع بيانات المطعم نهائيًا. هل تريد المتابعة؟")) return;
    await resetAllData(); await ensureEmptyWorkspace(); await ensureDefaultAccountingSetup(); await refresh(); setCart([]); setSection("inventory"); notify("تمت إعادة النظام إلى بداية دورة التشغيل");
  };
  const exportBackup = async () => {
    const payload = { version: 4, exportedAt: new Date().toISOString(), units: await db.units.toArray(), items: await db.items.toArray(), warehouses: await db.warehouses.toArray(), balances: await db.balances.toArray(), recipes: await db.recipes.toArray(), movements: await db.movements.toArray(), productionOrders: await db.productionOrders.toArray(), saleOrders: await db.saleOrders.toArray(), expenses: await db.expenses.toArray(), employees: await db.employees.toArray(), attendanceRecords: await db.attendanceRecords.toArray(), payrollRecords: await db.payrollRecords.toArray(), accounts: await db.accounts.toArray(), journalEntries: await db.journalEntries.toArray(), journalLines: await db.journalLines.toArray(), suppliers: await db.suppliers.toArray(), purchaseInvoices: await db.purchaseInvoices.toArray(), purchaseInvoiceLines: await db.purchaseInvoiceLines.toArray(), supplierPayments: await db.supplierPayments.toArray(), cashAccounts: await db.cashAccounts.toArray(), cashTransfers: await db.cashTransfers.toArray(), shifts: await db.shifts.toArray() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `restaurantflow-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); notify("تم تصدير النسخة الاحتياطية");
  };
  const logout = () => { sessionStorage.removeItem(AUTH_SESSION_KEY); setAuthenticated(false); setCart([]); };

  if (!ready) return <div className="loading"><div className="loading-card"><div className="loader" /><strong>جاري تجهيز RestaurantFlow</strong><p className="page-sub">تحميل دورة التشغيل…</p></div></div>;
  if (!data.settings?.passwordHash) return <AccountSetup onDone={async () => { sessionStorage.setItem(AUTH_SESSION_KEY, "1"); setAuthenticated(true); await refresh(); }} />;
  if (!authenticated) return <LoginScreen settings={data.settings} onSuccess={async () => { sessionStorage.setItem(AUTH_SESSION_KEY, "1"); setAuthenticated(true); await refresh(); }} />;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><BrandLogo settings={data.settings} /><div><strong>{data.settings?.restaurantName ?? "RestaurantFlow"}</strong><small>SMART RESTAURANT OS</small></div></div>
      <div className="nav-label">دورة التشغيل</div>
      <nav className="nav" aria-label="التنقل الرئيسي">{navItems.map((item, index) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><span>{item.icon}</span><span><small>{index + 1}</small>{item.label}</span></button>)}</nav>
      <div className="nav-label management-label">الإدارة</div>
      <nav className="nav management-nav" aria-label="أقسام الإدارة">{managementItems.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><span>{item.icon}</span><span>{item.label}</span></button>)}</nav>
      <div className="user-card"><div className="avatar">{data.settings?.username?.slice(0, 1).toUpperCase()}</div><div><strong>{data.settings?.username}</strong><small>مدير النظام</small></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="branch"><span className="branch-dot" /><div><strong>{data.settings?.restaurantName}</strong><small>الفرع الرئيسي · البيانات محفوظة محليًا</small></div></div><div className="top-actions"><button className="chip" onClick={() => setModal("settings")}>⚙ إعدادات المطعم</button><button className="chip" onClick={exportBackup}>↓ نسخة احتياطية</button><button className="chip" onClick={reset}>⌫ مسح البيانات</button><button className="chip danger" onClick={logout}>خروج</button><span className={`chip shift-chip ${data.shifts.some(x=>x.status==="open")?"":"closed"}`}>● {data.shifts.some(x=>x.status==="open")?"وردية مفتوحة":"لا توجد وردية"}</span></div></header>
      <div className="content">
        {isWorkflowSection && <div className="flow-steps" aria-label="المخزون ثم المطبخ ثم التصنيع ثم المنتج التام ثم الكاشير">{navItems.map((item, index) => <span key={item.id} style={{ display: "contents" }}><button className={`flow-step ${navItems.findIndex((entry) => entry.id === section) >= index ? "done" : ""}`} onClick={() => setSection(item.id)}><b>{index + 1}</b>{item.label}</button>{index < navItems.length - 1 && <span className="flow-arrow">←</span>}</span>)}</div>}
        <div className="page-head"><div><p className="eyebrow">{activeNav.eyebrow}</p><h1>{activeNav.label}</h1><p className="page-sub">{activeNav.description}</p></div><div className="head-actions">{section === "inventory" && <button className="btn primary" onClick={() => setModal("receipt")}>＋ إذن إضافة</button>}{section === "kitchen" && <button className="btn primary" onClick={() => setModal("transfer")}>⇄ تحويل إلى المطبخ</button>}{section === "production" && <button className="btn primary" onClick={() => setModal("production")}>⚙ أمر تصنيع</button>}{section === "hr" && <><button className="btn" onClick={() => setModal("payroll")}>ج إعداد راتب</button><button className="btn" onClick={() => setModal("attendance")}>◷ حضور وانصراف</button><button className="btn primary" onClick={() => setModal("employee")}>＋ موظف جديد</button></>}</div></div>
        {isWorkflowSection && <StepGuide section={section as WorkflowSection} onNext={goNext} />}
        {section === "inventory" && <InventoryView data={data} />}
        {section === "kitchen" && <KitchenView data={data} />}
        {section === "production" && <ProductionView data={data} />}
        {section === "finished" && <FinishedView data={data} refresh={refresh} notify={notify} />}
        {section === "pos" && <PosView data={data} cart={cart} setCart={setCart} payment={payment} setPayment={setPayment} refresh={refresh} notify={notify} onOpenShift={() => setSection("control")} />}
        {section === "control" && <OperationsControlModule data={data} refresh={refresh} notify={notify} />}
        {section === "accounts" && <FinanceModule data={data} refresh={refresh} notify={notify} />}
        {section === "hr" && <HumanResourcesView data={data} />}
      </div>
    </main>
    {modal && <Modal title={modal === "receipt" ? "إذن إضافة إلى المخزون" : modal === "transfer" ? "تحويل إلى المطبخ" : modal === "production" ? "أمر تصنيع منتج تام" : modal === "expense" ? "تسجيل مصروف مطعم" : modal === "employee" ? "إضافة موظف" : modal === "attendance" ? "تسجيل حضور وانصراف" : modal === "payroll" ? "إعداد راتب موظف" : "إعدادات المطعم والدخول"} onClose={() => setModal(null)}>
      {modal === "receipt" && <StockReceiptForm data={data} onDone={async () => { setModal(null); await refresh(); notify("تم تنفيذ إذن الإضافة وتحديث المخزون"); }} />}
      {modal === "transfer" && <KitchenTransferForm data={data} onDone={async () => { setModal(null); await refresh(); notify("تم التحويل إلى المطبخ بحركتين مرتبطتين"); }} />}
      {modal === "production" && <ProductionForm data={data} onDone={async (order) => { setModal(null); await refresh(); notify(`اكتمل ${order.number} بتكلفة ${formatMoney(order.totalCostPiasters)}`); }} />}
      {modal === "settings" && <RestaurantSettingsForm settings={data.settings} onDone={async () => { setModal(null); await refresh(); notify("تم تحديث اسم المطعم والشعار وبيانات الدخول"); }} />}
      {modal === "expense" && <ExpenseForm onDone={async () => { setModal(null); await refresh(); notify("تم تسجيل المصروف في الحسابات"); }} />}
      {modal === "employee" && <EmployeeForm onDone={async () => { setModal(null); await refresh(); notify("تمت إضافة الموظف"); }} />}
      {modal === "attendance" && <AttendanceForm employees={data.employees} onDone={async () => { setModal(null); await refresh(); notify("تم تسجيل الحضور والانصراف"); }} />}
      {modal === "payroll" && <PayrollForm employees={data.employees} onDone={async () => { setModal(null); await refresh(); notify("تم حفظ مسير الراتب"); }} />}
    </Modal>}
    {toast && <div className={`toast ${toast.error ? "error" : ""}`}>{toast.error ? "⚠ " : "✓ "}{toast.text}</div>}
  </div>;
}

function AccountSetup({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const chooseLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return setLogoDataUrl("");
    setBusy(true); setError("");
    try { setLogoDataUrl(await optimizeItemImage(file)); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تجهيز الشعار"); } finally { setBusy(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const username = String(form.get("username")).trim(); const password = String(form.get("password")); const confirm = String(form.get("confirm"));
    if (username.length < 3) return setError("اسم المستخدم يجب أن يكون 3 أحرف على الأقل");
    if (password.length < 6) return setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    if (password !== confirm) return setError("تأكيد كلمة المرور غير مطابق");
    if (busy) return setError("انتظر حتى ينتهي تجهيز الشعار");
    await db.settings.update("settings", { restaurantName: String(form.get("restaurantName")).trim(), logoDataUrl: logoDataUrl || undefined, username, passwordHash: await hashPassword(password) });
    onDone();
  };
  return <div className="auth-shell"><section className="auth-card"><div className="auth-brand"><BrandLogo settings={{ id: "settings", language: "ar", theme: "light", seeded: false, activeShift: true, restaurantName: "RestaurantFlow", logoDataUrl }} large /><div><span>إعداد مجاني لأول مرة</span><h1>جهّز حساب مطعمك</h1><p>أدخل اسم المطعم وشعاره وبيانات الدخول. تُحفظ على هذا الجهاز فقط.</p></div></div><form onSubmit={submit}>{error && <div className="form-error">{error}</div>}<div className="form-grid"><Field label="اسم المطعم" full><input name="restaurantName" required placeholder="مثال: مطعم السعادة" /></Field><Field label="اسم المستخدم"><input name="username" autoComplete="username" required placeholder="admin" /></Field><Field label="شعار المطعم (اختياري)"><label className="compact-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} />{busy ? "جارٍ تجهيز الشعار…" : "رفع صورة الشعار"}</label></Field><Field label="كلمة المرور"><input name="password" type="password" autoComplete="new-password" minLength={6} required /></Field><Field label="تأكيد كلمة المرور"><input name="confirm" type="password" autoComplete="new-password" minLength={6} required /></Field></div><button className="btn primary auth-submit" type="submit">حفظ وفتح النظام</button></form><p className="auth-note">لا توجد اشتراكات أو خدمات مدفوعة. الحماية محلية لهذا المتصفح والجهاز.</p></section></div>;
}

function LoginScreen({ settings, onSuccess }: { settings: AppSettings; onSuccess: () => void | Promise<void> }) {
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const username = String(form.get("username")).trim(); const password = String(form.get("password"));
    if (username !== settings.username || await hashPassword(password) !== settings.passwordHash) return setError("اسم المستخدم أو كلمة المرور غير صحيحة");
    await onSuccess();
  };
  const recover = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const restaurantName = String(form.get("restaurantName")).trim(); const username = String(form.get("newUsername")).trim();
    const password = String(form.get("newPassword")); const confirm = String(form.get("newConfirm"));
    if (restaurantName !== settings.restaurantName?.trim()) return setError("اسم المطعم غير مطابق للاسم المسجل على هذا الجهاز");
    if (username.length < 3) return setError("اسم المستخدم الجديد يجب أن يكون 3 أحرف على الأقل");
    if (password.length < 6) return setError("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");
    if (password !== confirm) return setError("تأكيد كلمة المرور الجديدة غير مطابق");
    await db.settings.update("settings", { username, passwordHash: await hashPassword(password) });
    await onSuccess();
  };
  return <div className="auth-shell"><section className="auth-card login-card"><div className="auth-brand login-brand"><BrandLogo settings={settings} large /><div><span>{recovering ? "استرداد محلي آمن" : "مرحبًا بعودتك"}</span><h1>{settings.restaurantName}</h1><p>{recovering ? "عيّن اسم مستخدم وكلمة مرور جديدين دون حذف بيانات المطعم." : "سجّل الدخول لإدارة المخزون والتصنيع والكاشير."}</p></div></div>{recovering ? <form onSubmit={recover}>{error && <div className="form-error">{error}</div>}<div className="form-grid one-column"><Field label="اكتب اسم المطعم للتأكيد" full><input name="restaurantName" autoComplete="organization" required autoFocus /></Field><Field label="اسم المستخدم الجديد" full><input name="newUsername" autoComplete="username" minLength={3} required /></Field><Field label="كلمة المرور الجديدة" full><input name="newPassword" type="password" autoComplete="new-password" minLength={6} required /></Field><Field label="تأكيد كلمة المرور الجديدة" full><input name="newConfirm" type="password" autoComplete="new-password" minLength={6} required /></Field></div><div className="auth-recovery-actions"><button className="btn primary" type="submit">حفظ بيانات الدخول الجديدة</button><button className="btn" type="button" onClick={() => { setRecovering(false); setError(""); }}>العودة لتسجيل الدخول</button></div><p className="local-security-note">لن تُحذف أي مواد أو أرصدة أو وصفات أو فواتير. الاسترداد متاح فقط من نفس المتصفح الذي يحتوي على بيانات المطعم.</p></form> : <form onSubmit={submit}>{error && <div className="form-error">{error}</div>}<div className="form-grid one-column"><Field label="اسم المستخدم" full><input name="username" autoComplete="username" required autoFocus /></Field><Field label="كلمة المرور" full><input name="password" type="password" autoComplete="current-password" required /></Field></div><button className="btn primary auth-submit" type="submit">دخول إلى النظام</button><button className="auth-forgot" type="button" onClick={() => { setRecovering(true); setError(""); }}>نسيت اسم المستخدم أو كلمة المرور؟</button></form>}<p className="auth-note">بيانات الدخول خاصة بهذا المتصفح. الاسترداد المحلي يغير بيانات الدخول فقط ولا يمس بيانات التشغيل.</p></section></div>;
}

const guideContent: Record<WorkflowSection, { title: string; bullets: string[]; action: string }> = {
  inventory: { title: "سجّل ما اشتريته أو استلمته", bullets: ["اختر الوحدة داخل الإذن", "أدخل التكلفة والمرجع", "الرصيد يتغير بحركة مسجلة"], action: "بعد الإضافة انتقل إلى المطبخ" },
  kitchen: { title: "جهّز مواد التشغيل", bullets: ["اختر من رصيد المخزن", "حوّل بالجرام أو الكيلوجرام", "الكمية تنتقل ولا تتكرر"], action: "بعد التحويل انتقل للتصنيع" },
  production: { title: "صنّع من رصيد المطبخ فقط", bullets: ["حدد المنتج والمكونات", "راجع الكميات المتاحة", "الناتج يذهب للمنتج التام"], action: "راجع المنتج التام" },
  finished: { title: "راجع الجاهز للبيع", bullets: ["الرصيد ناتج من التصنيع", "عدّل سعر البيع فقط", "تابع التكلفة وهامش الربح"], action: "افتح الكاشير" },
  pos: { title: "حصّل الطلب من الرصيد الجاهز", bullets: ["أضف المنتج بضغطة", "لا بيع فوق الرصيد", "اطبع إيصال 80mm"], action: "ابدأ طلبًا جديدًا" },
};
function StepGuide({ section, onNext }: { section: WorkflowSection; onNext: () => void }) {
  const guide = guideContent[section]; const step = navItems.findIndex((item) => item.id === section) + 1;
  return <section className="guide"><div className="guide-number">الخطوة {step}</div><div className="guide-copy"><span>ماذا أفعل الآن؟</span><h2>{guide.title}</h2><p>{navItems[step - 1].description}</p></div><div className="guide-checks">{guide.bullets.map((bullet) => <div key={bullet}><b>✓</b>{bullet}</div>)}</div>{section !== "pos" && <button className="btn guide-action" onClick={onNext}>{guide.action} ←</button>}</section>;
}

function stageWarehouse(data: AppData, stage: Warehouse["stage"]) { return data.warehouses.find((entry) => entry.stage === stage && entry.active); }
function balanceFor(data: AppData, warehouseId: string | undefined, itemId: string) { return data.balances.find((entry) => entry.warehouseId === warehouseId && entry.itemId === itemId); }
function displayQuantity(data: AppData, item: InventoryItem, quantityBase: number) {
  const base = data.units.find((unit) => unit.id === item.baseUnitId); const preferred = data.units.find((unit) => unit.id === item.purchaseUnitId) ?? base;
  if (!base || !preferred) return `${formatQuantity(quantityBase)}`;
  return `${formatQuantity(convertUnitForDisplay(quantityBase, base.baseFactor, preferred.baseFactor))} ${preferred.symbol}`;
}
function convertUnitForDisplay(quantity: number, fromFactor: number, toFactor: number) { return Math.round((quantity * fromFactor / toFactor) * 1000) / 1000; }
function Stat({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: string }) { return <div className="stat"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><small>{hint}</small></div>; }
function Empty({ icon, title, text }: { icon: string; title: string; text: string }) { return <div className="empty"><span>{icon}</span><strong>{title}</strong><p>{text}</p></div>; }

function InventoryView({ data }: { data: AppData }) {
  const warehouse = stageWarehouse(data, "raw"); const kitchen = stageWarehouse(data, "work_in_progress"); const items = data.items.filter((item) => item.stage !== "finished" && item.active);
  const value = items.reduce((sum, item) => { const balance = balanceFor(data, warehouse?.id, item.id); return sum + (balance?.quantity ?? 0) * (balance?.averageCostPiasters ?? 0); }, 0);
  const receipts = data.movements.filter((movement) => ["opening", "purchase", "stock_receipt"].includes(movement.type));
  return <><div className="stats"><Stat label="مواد المخزون" value={String(items.length)} hint="مواد مسجلة" icon="◇" /><Stat label="قيمة المخزون" value={formatMoney(value)} hint="بمتوسط التكلفة" icon="ج" /><Stat label="أذون الإضافة" value={String(receipts.length)} hint="حركات موثقة" icon="＋" /><Stat label="تحت الحد الأدنى" value={String(items.filter((item) => (balanceFor(data, warehouse?.id, item.id)?.quantity ?? 0) <= item.minLevel).length)} hint="تحتاج متابعة" icon="!" /></div><div className="panel"><div className="panel-head"><div><h2>أرصدة المخزن والمطبخ</h2><small>تتحدث تلقائيًا مع التحويل والتصنيع</small></div><span className="badge blue">{warehouse?.nameAr}</span></div>{items.length ? <div className="table-wrap"><table><thead><tr><th>المادة</th><th>الكود</th><th>التصنيف</th><th>رصيد المخزن</th><th>رصيد المطبخ</th><th>متوسط التكلفة</th><th>القيمة</th><th>الحالة</th></tr></thead><tbody>{items.map((item) => { const balance = balanceFor(data, warehouse?.id, item.id); const kitchenBalance = balanceFor(data, kitchen?.id, item.id); const quantity = balance?.quantity ?? 0; const kitchenQuantity = kitchenBalance?.quantity ?? 0; return <tr key={item.id}><td><div className="item-with-image"><ItemImage item={item} fallback="🥬" /><div className="item-name"><strong>{item.nameAr}</strong><small>{item.nameEn}</small></div></div></td><td>{item.code}</td><td>{item.category}</td><td>{displayQuantity(data, item, quantity)}</td><td><strong>{displayQuantity(data, item, kitchenQuantity)}</strong></td><td>{formatMoney(balance?.averageCostPiasters ?? item.averageCostPiasters)}</td><td>{formatMoney(quantity * (balance?.averageCostPiasters ?? 0))}</td><td><span className={`badge ${quantity <= item.minLevel ? "amber" : "green"}`}>{quantity <= item.minLevel ? "منخفض" : "متاح"}</span></td></tr>; })}</tbody></table></div> : <Empty icon="1" title="المخزون فارغ" text="نفّذ أول إذن إضافة وسجّل المادة والكمية والوحدة والتكلفة." />}</div><MovementLedger data={data} movements={receipts.slice(0, 8)} title="آخر أذون الإضافة" /></>;
}

function KitchenView({ data }: { data: AppData }) {
  const kitchen = stageWarehouse(data, "work_in_progress"); const items = data.items.filter((item) => item.stage !== "finished" && (balanceFor(data, kitchen?.id, item.id)?.quantity ?? 0) > 0);
  const transfers = data.movements.filter((movement) => movement.type === "transfer_to_kitchen_in");
  return <><div className="stats"><Stat label="مواد بالمطبخ" value={String(items.length)} hint="جاهزة للتصنيع" icon="♨" /><Stat label="عمليات التحويل" value={String(transfers.length)} hint="من المخزن الرئيسي" icon="⇄" /><Stat label="قيمة رصيد المطبخ" value={formatMoney(items.reduce((sum, item) => { const balance = balanceFor(data, kitchen?.id, item.id); return sum + (balance?.quantity ?? 0) * (balance?.averageCostPiasters ?? 0); }, 0))} hint="بنفس تكلفة المخزن" icon="ج" /><Stat label="آخر تحويل" value={transfers[0] ? new Date(transfers[0].createdAt).toLocaleDateString("ar-EG") : "—"} hint="تاريخ آخر استلام" icon="◷" /></div><div className="panel"><div className="panel-head"><div><h2>رصيد المطبخ</h2><small>مواد محولة فعليًا من المخزن الرئيسي</small></div><span className="badge green">مخزون مرحلي</span></div>{items.length ? <div className="cards kitchen-cards">{items.map((item) => { const balance = balanceFor(data, kitchen?.id, item.id); const last = transfers.find((movement) => movement.itemId === item.id); return <div className="entity-card" key={item.id}><div className="entity-card-top"><div className="item-with-image"><ItemImage item={item} fallback="🥣" /><div><h3>{item.nameAr}</h3><p>{item.code} · {item.category}</p></div></div><span className="badge green">متاح</span></div><div className="entity-meta"><span className="badge blue">{displayQuantity(data, item, balance?.quantity ?? 0)}</span><span className="badge">متوسط {formatMoney(balance?.averageCostPiasters ?? 0)}</span></div>{last && <p className="card-note">آخر تحويل: {formatQuantity(last.enteredQuantity ?? Math.abs(last.quantity))} {data.units.find((unit) => unit.id === last.enteredUnitId)?.symbol ?? ""} · {new Date(last.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</p>}</div>; })}</div> : <Empty icon="2" title="المطبخ ينتظر المواد" text="حوّل كمية من المخزن الرئيسي؛ لا يتم إنشاء كمية جديدة هنا." />}</div><MovementLedger data={data} movements={transfers.slice(0, 8)} title="آخر تحويلات المطبخ" currentWarehouseId={kitchen?.id} /></>;
}

function ProductionView({ data }: { data: AppData }) {
  return <><div className="stats"><Stat label="أوامر مكتملة" value={String(data.productionOrders.length)} hint="كلها معاملات ذرية" icon="⚙" /><Stat label="منتجات مصنعة" value={String(new Set(data.recipes.map((recipe) => recipe.outputItemId)).size)} hint="تعريفات إنتاج" icon="✓" /><Stat label="إجمالي تكلفة الإنتاج" value={formatMoney(data.productionOrders.reduce((sum, order) => sum + order.totalCostPiasters, 0))} hint="تكلفة فعلية" icon="ج" /><Stat label="رصيد المطبخ" value={String(data.balances.filter((balance) => balance.warehouseId === stageWarehouse(data, "work_in_progress")?.id && balance.quantity > 0).length)} hint="مكونات متاحة" icon="♨" /></div><div className="panel"><div className="panel-head"><div><h2>سجل أوامر التصنيع</h2><small>السحب من المطبخ والإضافة للمنتج التام</small></div><span className="badge green">ذري بالكامل</span></div>{data.productionOrders.length ? <div className="table-wrap"><table><thead><tr><th>الأمر</th><th>المنتج</th><th>الكمية</th><th>التكلفة</th><th>تكلفة الوحدة</th><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>{data.productionOrders.map((order) => { const recipe = data.recipes.find((entry) => entry.id === order.recipeId); const item = data.items.find((entry) => entry.id === recipe?.outputItemId); return <tr key={order.id}><td><strong>{order.number}</strong></td><td><div className="item-with-image"><ItemImage item={item} fallback="🍳" /><strong>{item?.nameAr ?? "منتج"}</strong></div></td><td>{formatQuantity(order.actualQuantity)}</td><td>{formatMoney(order.totalCostPiasters)}</td><td>{formatMoney(order.unitCostPiasters)}</td><td>{new Date(order.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</td><td><span className="badge green">مكتمل</span></td></tr>; })}</tbody></table></div> : <Empty icon="3" title="لا توجد أوامر تصنيع" text="حوّل المكونات إلى المطبخ ثم أنشئ أول منتج تام." />}</div></>;
}

function FinishedView({ data, refresh, notify }: { data: AppData; refresh: () => Promise<void>; notify: (text: string, error?: boolean) => void }) {
  const warehouse = stageWarehouse(data, "finished"); const products = data.items.filter((item) => item.stage === "finished" && item.active);
  const updatePrice = async (item: InventoryItem) => { const value = window.prompt(`سعر بيع ${item.nameAr} بالجنيه`, String((item.salePricePiasters ?? 0) / 100)); if (value === null) return; const price = Number(value); if (!Number.isFinite(price) || price < 0) return notify("أدخل سعرًا صحيحًا", true); await db.items.update(item.id, { salePricePiasters: Math.round(price * 100), updatedAt: new Date().toISOString() }); await refresh(); notify("تم تحديث سعر البيع دون تغيير التكلفة"); };
  return <div className="finished-grid">{products.length ? products.map((item) => { const balance = balanceFor(data, warehouse?.id, item.id); const quantity = balance?.quantity ?? 0; const cost = balance?.averageCostPiasters ?? item.averageCostPiasters; const price = item.salePricePiasters ?? 0; const profit = price - cost; const margin = price ? Math.round((profit / price) * 100) : 0; const last = data.movements.find((movement) => movement.itemId === item.id && movement.type === "production_output"); return <article className="finished-card" key={item.id}><div className="finished-image"><ItemImage item={item} fallback="🍽️" large /></div><div className="finished-body"><div className="entity-card-top"><div><h3>{item.nameAr}</h3><p>{item.code} · {item.category}</p></div><span className={`badge ${quantity <= 0 ? "amber" : quantity <= item.minLevel ? "amber" : "green"}`}>{quantity <= 0 ? "غير متاح" : quantity <= item.minLevel ? "رصيد منخفض" : "متاح"}</span></div><strong className="stock-number">{displayQuantity(data, item, quantity)}</strong><div className="profit-grid"><div><span>تكلفة الوحدة</span><b>{formatMoney(cost)}</b></div><div><span>سعر البيع</span><b>{formatMoney(price)}</b></div><div><span>ربح الوحدة</span><b>{formatMoney(profit)}</b></div><div><span>هامش الربح</span><b>{margin}%</b></div></div><p className="card-note">آخر تصنيع: {last ? new Date(last.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "لم يُصنع بعد"}</p><button className="btn small" onClick={() => updatePrice(item)}>تعديل سعر البيع</button></div></article>; }) : <div className="panel"><Empty icon="4" title="لا يوجد منتج تام" text="بمجرد اكتمال أمر التصنيع سيظهر المنتج هنا تلقائيًا." /></div>}</div>;
}

function MovementLedger({ data, movements, title, currentWarehouseId }: { data: AppData; movements: StockMovement[]; title: string; currentWarehouseId?: string }) {
  if (!movements.length) return null;
  return <div className="panel ledger"><div className="panel-head"><div><h2>{title}</h2><small>سجل للقراءة فقط</small></div><span className="badge">{movements.length} حركة</span></div><div className="table-wrap"><table><thead><tr><th>المرجع</th><th>الحركة</th><th>الصنف</th><th>الكمية المدخلة</th>{currentWarehouseId && <th>الرصيد الحالي</th>}<th>القيمة</th><th>التاريخ</th></tr></thead><tbody>{movements.map((movement) => { const item = data.items.find((entry) => entry.id === movement.itemId); const currentBalance = balanceFor(data, currentWarehouseId, movement.itemId)?.quantity ?? 0; return <tr key={movement.id}><td><strong>{movement.reference}</strong></td><td><span className={`badge ${movement.quantity > 0 ? "green" : "amber"}`}>{movementLabels[movement.type]}</span></td><td><div className="item-with-image"><ItemImage item={item} fallback="◇" /><strong>{item?.nameAr}</strong></div></td><td>{formatQuantity(movement.enteredQuantity ?? Math.abs(movement.quantity))} {data.units.find((unit) => unit.id === movement.enteredUnitId)?.symbol ?? data.units.find((unit) => unit.id === item?.baseUnitId)?.symbol}</td>{currentWarehouseId && <td><strong>{item ? displayQuantity(data, item, currentBalance) : formatQuantity(currentBalance)}</strong></td>}<td>{formatMoney(Math.abs(movement.totalCostPiasters))}</td><td>{new Date(movement.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</td></tr>; })}</tbody></table></div></div>;
}

function PosView({ data, cart, setCart, payment, setPayment, refresh, notify, onOpenShift }: { data: AppData; cart: OrderItem[]; setCart: React.Dispatch<React.SetStateAction<OrderItem[]>>; payment: "cash" | "card" | "wallet"; setPayment: (value: "cash" | "card" | "wallet") => void; refresh: () => Promise<void>; notify: (text: string, error?: boolean) => void; onOpenShift:()=>void }) {
  const [receipt, setReceipt] = useState<SaleOrder | null>(null); const [query, setQuery] = useState(""); const warehouse = stageWarehouse(data, "finished");
  const products = data.items.filter((item) => item.stage === "finished" && item.active && item.salePricePiasters && `${item.nameAr} ${item.code} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const available = (id: string) => balanceFor(data, warehouse?.id, id)?.quantity ?? 0;
  const add = (item: InventoryItem) => { const current = cart.find((line) => line.itemId === item.id)?.quantity ?? 0; if (current + 1 > available(item.id)) return notify(`${item.nameAr}: المتاح ${formatQuantity(available(item.id))} فقط`, true); setCart((value) => value.some((line) => line.itemId === item.id) ? value.map((line) => line.itemId === item.id ? { ...line, quantity: line.quantity + 1 } : line) : [...value, { id: crypto.randomUUID(), itemId: item.id, name: item.nameAr, quantity: 1, unitPricePiasters: item.salePricePiasters ?? 0, costPiasters: item.averageCostPiasters }]); };
  const changeQty = (id: string, delta: number) => { const line = cart.find((entry) => entry.id === id); if (!line) return; if (delta > 0 && line.quantity + delta > available(line.itemId)) return notify(`${line.name}: المتاح ${formatQuantity(available(line.itemId))} فقط`, true); setCart((value) => value.map((entry) => entry.id === id ? { ...entry, quantity: entry.quantity + delta } : entry).filter((entry) => entry.quantity > 0)); };
  const subtotal = cart.reduce((sum, line) => sum + line.quantity * line.unitPricePiasters, 0); const tax = Math.round(subtotal * 0.14);
  const checkout = async () => { if (!cart.length) return; try { const sale = await completeSale({ type: "takeaway", items: cart, subtotalPiasters: subtotal, taxPiasters: tax, totalPiasters: subtotal + tax, paymentMethod: payment }); setReceipt(sale); setCart([]); await refresh(); notify(`تم تحصيل ${sale.number}`); } catch (error) { notify(error instanceof Error ? error.message : "تعذر إتمام الطلب", true); } };
  return <>{!data.shifts.some(x=>x.status==="open")&&<div className="operation-alert red">لا يمكن إتمام البيع قبل فتح وردية كاشير. <button className="btn small primary" onClick={onOpenShift}>فتح وردية الآن</button></div>}<div className="pos-layout"><div><div className="toolbar"><div className="search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن منتج أو امسح الباركود…" /></div><span className="filter">منتجات تامة فقط</span></div>{products.length ? <div className="product-grid">{products.map((product, index) => { const quantity = available(product.id); return <button className="product" key={product.id} disabled={quantity <= 0} onClick={() => add(product)}><div className="product-visual"><ItemImage item={product} fallback={["🍕", "🍝", "☕", "🥪"][index % 4]} large /></div><div className="product-title-row"><span className="product-category">{product.category}</span><span className={`badge ${quantity > 0 ? "green" : "amber"}`}>{quantity > 0 ? `متاح ${formatQuantity(quantity)}` : "غير متاح"}</span></div><strong>{product.nameAr}</strong><span className="product-price">{formatMoney(product.salePricePiasters ?? 0)}</span></button>; })}</div> : <div className="panel"><Empty icon="5" title="الكاشير ينتظر المنتج التام" text="صنّع منتجًا وحدد سعره ليظهر هنا. المواد الخام لا تظهر في الكاشير." /></div>}</div><div className="panel cart"><div className="panel-head"><div><h2>الطلب الحالي</h2><small>تيك أواي · طلب جديد</small></div><span className="badge green">{cart.reduce((sum, line) => sum + line.quantity, 0)} قطعة</span></div>{cart.length ? <div className="cart-list">{cart.map((line) => <div className="cart-row" key={line.id}><div><strong>{line.name}</strong><small>{formatMoney(line.unitPricePiasters)} × {line.quantity}</small><div className="qty"><button onClick={() => changeQty(line.id, -1)}>−</button><b>{line.quantity}</b><button onClick={() => changeQty(line.id, 1)}>＋</button></div></div><strong>{formatMoney(line.unitPricePiasters * line.quantity)}</strong></div>)}</div> : <Empty icon="▤" title="الطلب فارغ" text="اضغط على منتج متاح لإضافته." />}<div className="cart-total"><div className="total-line"><span>الإجمالي الفرعي</span><strong>{formatMoney(subtotal)}</strong></div><div className="total-line"><span>الضريبة 14%</span><strong>{formatMoney(tax)}</strong></div><div className="total-line grand"><span>الإجمالي</span><strong>{formatMoney(subtotal + tax)}</strong></div><div className="pay-methods">{(["cash", "card", "wallet"] as const).map((value) => <button key={value} className={payment === value ? "active" : ""} onClick={() => setPayment(value)}>{value === "cash" ? "نقدي" : value === "card" ? "بطاقة" : "محفظة"}</button>)}</div><button className="btn primary checkout" disabled={!cart.length} onClick={checkout}>تحصيل {formatMoney(subtotal + tax)}</button></div></div></div>{receipt && <ReceiptDialog sale={receipt} onClose={() => setReceipt(null)} />}</>;
}

const expenseLabels: Record<RestaurantExpense["category"], string> = { supplies: "مستلزمات تشغيل", utilities: "مرافق", rent: "إيجار", maintenance: "صيانة", marketing: "تسويق", delivery: "توصيل", other: "أخرى" };
const attendanceLabels: Record<AttendanceRecord["status"], string> = { present: "حاضر", absent: "غائب", leave: "إجازة" };

function HumanResourcesView({ data }: { data: AppData }) {
  const today = new Date().toISOString().slice(0, 10); const month = today.slice(0, 7);
  const monthlyPayroll = data.payrollRecords.filter((record) => record.month === month).reduce((sum, record) => sum + record.netPiasters, 0);
  return <><div className="stats"><Stat label="الموظفون النشطون" value={String(data.employees.filter((employee) => employee.status === "active").length)} hint="فريق العمل الحالي" icon="♟" /><Stat label="الحاضرون اليوم" value={String(data.attendanceRecords.filter((record) => record.workDate === today && record.status === "present").length)} hint="سجل اليوم" icon="✓" /><Stat label="رواتب الشهر" value={formatMoney(monthlyPayroll)} hint={month} icon="ج" /><Stat label="رواتب معلقة" value={String(data.payrollRecords.filter((record) => record.status === "pending").length)} hint="لم يتم صرفها" icon="!" /></div><section className="panel"><div className="panel-head"><div><h2>دليل الموظفين</h2><small>الوظائف والهواتف والرواتب الأساسية</small></div><span className="badge green">{data.employees.length} موظف</span></div>{data.employees.length ? <div className="table-wrap"><table><thead><tr><th>الكود</th><th>الموظف</th><th>الوظيفة</th><th>الهاتف</th><th>الراتب الأساسي</th><th>تاريخ التعيين</th><th>الحالة</th></tr></thead><tbody>{data.employees.map((employee) => <tr key={employee.id}><td>{employee.code}</td><td><strong>{employee.name}</strong></td><td>{employee.role}</td><td>{employee.phone || "—"}</td><td>{formatMoney(employee.baseSalaryPiasters)}</td><td>{new Date(employee.hireDate).toLocaleDateString("ar-EG")}</td><td><span className={`badge ${employee.status === "active" ? "green" : "amber"}`}>{employee.status === "active" ? "نشط" : "غير نشط"}</span></td></tr>)}</tbody></table></div> : <Empty icon="♟" title="لا يوجد موظفون" text="أضف أفراد فريق المطعم لتسجيل الحضور والرواتب." />}</section><div className="accounts-grid"><section className="panel"><div className="panel-head"><div><h2>آخر الحضور والانصراف</h2><small>الحضور والغياب والإجازات</small></div></div>{data.attendanceRecords.length ? <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>الموظف</th><th>الحالة</th><th>الدخول</th><th>الخروج</th><th>إضافي</th></tr></thead><tbody>{data.attendanceRecords.slice(0, 12).map((record) => <tr key={record.id}><td>{record.workDate}</td><td><strong>{data.employees.find((employee) => employee.id === record.employeeId)?.name}</strong></td><td><span className={`badge ${record.status === "present" ? "green" : "amber"}`}>{attendanceLabels[record.status]}</span></td><td>{record.checkIn || "—"}</td><td>{record.checkOut || "—"}</td><td>{record.overtimeHours} س</td></tr>)}</tbody></table></div> : <Empty icon="◷" title="لا يوجد سجل حضور" text="سجّل حضور أو غياب أول موظف." />}</section><section className="panel"><div className="panel-head"><div><h2>مسير الرواتب</h2><small>الصافي بعد الإضافي والمكافآت والخصومات والسلف</small></div></div>{data.payrollRecords.length ? <div className="table-wrap"><table><thead><tr><th>الشهر</th><th>الموظف</th><th>الأساسي</th><th>الخصومات والسلف</th><th>الصافي</th><th>الحالة</th></tr></thead><tbody>{data.payrollRecords.slice(0, 12).map((record) => <tr key={record.id}><td>{record.month}</td><td><strong>{data.employees.find((employee) => employee.id === record.employeeId)?.name}</strong></td><td>{formatMoney(record.baseSalaryPiasters)}</td><td>{formatMoney(record.deductionPiasters + record.advancePiasters)}</td><td><strong>{formatMoney(record.netPiasters)}</strong></td><td><span className={`badge ${record.status === "paid" ? "green" : "amber"}`}>{record.status === "paid" ? "مدفوع" : "معلق"}</span></td></tr>)}</tbody></table></div> : <Empty icon="ج" title="لا توجد رواتب" text="أنشئ أول مسير راتب بعد إضافة الموظفين." />}</section></div></>;
}

function auditFields() { const now = new Date().toISOString(); return { createdAt: now, updatedAt: now, createdBy: "local-admin" }; }
function ExpenseForm({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState(""); const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await db.expenses.add({ id: crypto.randomUUID(), category: String(form.get("category")) as RestaurantExpense["category"], description: String(form.get("description")).trim(), amountPiasters: Math.round(Number(form.get("amount")) * 100), paymentMethod: String(form.get("paymentMethod")) as RestaurantExpense["paymentMethod"], expenseDate: String(form.get("expenseDate")), ...auditFields() }); onDone(); } catch { setError("تعذر تسجيل المصروف. راجع البيانات."); } };
  return <FormShell error={error} onSubmit={submit} submitLabel="تسجيل المصروف"><Field label="بيان المصروف" full><input name="description" required placeholder="مثال: فاتورة كهرباء" /></Field><Field label="التصنيف"><select name="category">{Object.entries(expenseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="القيمة بالجنيه"><input name="amount" type="number" min="0.01" step="0.01" required /></Field><Field label="طريقة الدفع"><select name="paymentMethod"><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="wallet">محفظة</option></select></Field><Field label="تاريخ المصروف"><input name="expenseDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field></FormShell>;
}

function EmployeeForm({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState(""); const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { const code = String(form.get("code")).trim(); if (await db.employees.where("code").equals(code).first()) return setError("كود الموظف مستخدم بالفعل"); await db.employees.add({ id: crypto.randomUUID(), code, name: String(form.get("name")).trim(), role: String(form.get("role")).trim(), phone: String(form.get("phone")).trim() || undefined, baseSalaryPiasters: Math.round(Number(form.get("salary")) * 100), hireDate: String(form.get("hireDate")), status: "active", ...auditFields() }); onDone(); } catch { setError("تعذر إضافة الموظف. راجع البيانات."); } };
  return <FormShell error={error} onSubmit={submit} submitLabel="إضافة الموظف"><Field label="اسم الموظف"><input name="name" required /></Field><Field label="كود الموظف"><input name="code" required placeholder="EMP-001" /></Field><Field label="الوظيفة"><input name="role" required placeholder="كاشير، شيف، ويتر…" /></Field><Field label="رقم الهاتف"><input name="phone" inputMode="tel" /></Field><Field label="الراتب الأساسي بالجنيه"><input name="salary" type="number" min="0" step="0.01" required /></Field><Field label="تاريخ التعيين"><input name="hireDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field></FormShell>;
}

function AttendanceForm({ employees, onDone }: { employees: Employee[]; onDone: () => void }) {
  const active = employees.filter((employee) => employee.status === "active"); const [error, setError] = useState(""); const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { if (!active.length) return setError("أضف موظفًا أولًا"); await db.attendanceRecords.add({ id: crypto.randomUUID(), employeeId: String(form.get("employeeId")), workDate: String(form.get("workDate")), status: String(form.get("status")) as AttendanceRecord["status"], checkIn: String(form.get("checkIn")) || undefined, checkOut: String(form.get("checkOut")) || undefined, overtimeHours: Number(form.get("overtimeHours")) || 0, ...auditFields() }); onDone(); } catch { setError("تعذر تسجيل الحضور والانصراف"); } };
  return <FormShell error={error} onSubmit={submit} submitLabel="حفظ سجل الحضور"><Field label="الموظف" full><select name="employeeId" required><option value="">اختر الموظف</option>{active.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} — {employee.role}</option>)}</select></Field><Field label="التاريخ"><input name="workDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field><Field label="الحالة"><select name="status"><option value="present">حاضر</option><option value="absent">غائب</option><option value="leave">إجازة</option></select></Field><Field label="وقت الدخول"><input name="checkIn" type="time" /></Field><Field label="وقت الخروج"><input name="checkOut" type="time" /></Field><Field label="ساعات إضافية"><input name="overtimeHours" type="number" min="0" step="0.5" defaultValue="0" /></Field></FormShell>;
}

function PayrollForm({ employees, onDone }: { employees: Employee[]; onDone: () => void }) {
  const active = employees.filter((employee) => employee.status === "active"); const [error, setError] = useState(""); const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { const employee = active.find((entry) => entry.id === String(form.get("employeeId"))); if (!employee) return setError("اختر موظفًا صحيحًا"); const overtime = Math.round(Number(form.get("overtime")) * 100), bonus = Math.round(Number(form.get("bonus")) * 100), deduction = Math.round(Number(form.get("deduction")) * 100), advance = Math.round(Number(form.get("advance")) * 100); const status = String(form.get("status")) as PayrollRecord["status"]; await db.payrollRecords.add({ id: crypto.randomUUID(), employeeId: employee.id, month: String(form.get("month")), baseSalaryPiasters: employee.baseSalaryPiasters, overtimePiasters: overtime, bonusPiasters: bonus, deductionPiasters: deduction, advancePiasters: advance, netPiasters: employee.baseSalaryPiasters + overtime + bonus - deduction - advance, status, paidAt: status === "paid" ? new Date().toISOString() : undefined, ...auditFields() }); onDone(); } catch { setError("تعذر حفظ مسير الراتب"); } };
  return <FormShell error={error} onSubmit={submit} submitLabel="حفظ مسير الراتب"><Field label="الموظف" full><select name="employeeId" required><option value="">اختر الموظف</option>{active.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} — راتب {formatMoney(employee.baseSalaryPiasters)}</option>)}</select></Field><Field label="شهر الاستحقاق"><input name="month" type="month" defaultValue={new Date().toISOString().slice(0, 7)} required /></Field><Field label="إضافي بالجنيه"><input name="overtime" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="مكافآت بالجنيه"><input name="bonus" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="خصومات بالجنيه"><input name="deduction" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="سلف بالجنيه"><input name="advance" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="حالة الصرف"><select name="status"><option value="pending">معلق</option><option value="paid">مدفوع</option></select></Field></FormShell>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal wide"><div className="modal-head"><h2>{title}</h2><button className="close" onClick={onClose}>×</button></div>{children}</div></div>; }
function FormShell({ children, error, onSubmit, submitLabel = "حفظ وتنفيذ" }: { children: ReactNode; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>; submitLabel?: string }) { return <form onSubmit={onSubmit}><div className="modal-body">{error && <div className="form-error">{error}</div>}<div className="form-grid">{children}</div></div><div className="modal-foot"><button type="submit" className="btn primary">{submitLabel}</button></div></form>; }
function Field({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) { return <div className={`field ${full ? "full" : ""}`}><label>{label}</label>{children}</div>; }
function ImageField({ imageDataUrl, busy, onChange }: { imageDataUrl: string; busy: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) { return <Field label="صورة اختيارية" full><div className="image-upload"><label className="image-picker"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={onChange} /><span>{busy ? "جارٍ تجهيز الصورة…" : imageDataUrl ? "تغيير الصورة" : "اختيار صورة"}</span><small>تظهر في المخزون والمنتج التام والكاشير</small></label><div className="image-preview">{imageDataUrl ? <Image src={imageDataUrl} alt="معاينة الصورة" width={208} height={208} unoptimized /> : "📷"}</div></div></Field>; }

function useImagePicker(setError: (value: string) => void) {
  const [imageDataUrl, setImageDataUrl] = useState(""); const [busy, setBusy] = useState(false);
  const chooseImage = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return setImageDataUrl(""); setBusy(true); setError(""); try { setImageDataUrl(await optimizeItemImage(file)); } catch (error) { setError(error instanceof Error ? error.message : "تعذر تجهيز الصورة"); } finally { setBusy(false); } };
  return { imageDataUrl, busy, chooseImage };
}

function RestaurantSettingsForm({ settings, onDone }: { settings?: AppSettings; onDone: () => void }) {
  const [error, setError] = useState(""); const [logoDataUrl, setLogoDataUrl] = useState(settings?.logoDataUrl ?? ""); const [busy, setBusy] = useState(false);
  const chooseLogo = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError(""); try { setLogoDataUrl(await optimizeItemImage(file)); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تجهيز الشعار"); } finally { setBusy(false); } };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const username = String(form.get("username")).trim(); const password = String(form.get("password")); const confirm = String(form.get("confirm"));
    if (username.length < 3) return setError("اسم المستخدم يجب أن يكون 3 أحرف على الأقل");
    if (password && password.length < 6) return setError("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");
    if (password !== confirm) return setError("تأكيد كلمة المرور غير مطابق");
    if (busy) return setError("انتظر حتى ينتهي تجهيز الشعار");
    await db.settings.update("settings", { restaurantName: String(form.get("restaurantName")).trim(), logoDataUrl: logoDataUrl || undefined, username, passwordHash: password ? await hashPassword(password) : settings?.passwordHash });
    onDone();
  };
  return <FormShell error={error} onSubmit={submit} submitLabel="حفظ إعدادات المطعم"><Field label="اسم المطعم" full><input name="restaurantName" defaultValue={settings?.restaurantName} required /></Field><Field label="اسم المستخدم"><input name="username" defaultValue={settings?.username} autoComplete="username" required /></Field><Field label="الشعار"><div className="settings-logo"><BrandLogo settings={{ ...settings, id: "settings", language: settings?.language ?? "ar", theme: settings?.theme ?? "light", seeded: false, activeShift: settings?.activeShift ?? true, logoDataUrl }} /><label className="compact-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} />تغيير الشعار</label>{logoDataUrl && <button type="button" className="btn small danger" onClick={() => setLogoDataUrl("")}>حذف</button>}</div></Field><Field label="كلمة مرور جديدة (اختياري)"><input name="password" type="password" autoComplete="new-password" placeholder="اتركها فارغة دون تغيير" /></Field><Field label="تأكيد كلمة المرور الجديدة"><input name="confirm" type="password" autoComplete="new-password" /></Field><Field label="معلومة مهمة" full><div className="local-security-note">يتم حفظ بصمة كلمة المرور والشعار محليًا داخل هذا المتصفح. لا تُرسل كلمة المرور إلى خادم خارجي.</div></Field></FormShell>;
}

function StockReceiptForm({ data, onDone }: { data: AppData; onDone: () => void }) {
  const [error, setError] = useState(""); const image = useImagePicker(setError); const allowedUnits = data.units.filter((unit) => unit.active && ["mass", "count"].includes(unit.family));
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (image.busy) return setError("انتظر تجهيز الصورة"); const form = new FormData(event.currentTarget); try { await addOpeningStock({ newItem: { nameAr: String(form.get("nameAr")), nameEn: String(form.get("nameEn") || form.get("nameAr")), code: String(form.get("code")), category: String(form.get("category")), minLevel: Number(form.get("minLevel")), imageDataUrl: image.imageDataUrl || undefined }, quantity: Number(form.get("quantity")), enteredUnitId: String(form.get("unit")), unitCostPiasters: Math.round(Number(form.get("cost")) * 100), reference: String(form.get("reference")), note: String(form.get("note")) }); onDone(); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تنفيذ إذن الإضافة"); } };
  return <FormShell error={error} onSubmit={submit} submitLabel="تنفيذ إذن الإضافة"><Field label="اسم المادة"><input name="nameAr" required /></Field><Field label="كود الصنف"><input name="code" required placeholder="RAW-001" /></Field><Field label="التصنيف"><input name="category" required placeholder="مواد غذائية" /></Field><Field label="الاسم بالإنجليزية"><input name="nameEn" /></Field><Field label="الكمية"><input name="quantity" type="number" min="0.001" step="0.001" required /></Field><Field label="الوحدة"><select name="unit" required>{allowedUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.nameAr}</option>)}</select></Field><Field label="تكلفة الوحدة بالجنيه"><input name="cost" type="number" min="0" step="0.01" required /></Field><Field label="إجمالي القيمة"><input disabled placeholder="يحسب تلقائيًا من الكمية × التكلفة" /></Field><Field label="الحد الأدنى"><input name="minLevel" type="number" min="0" step="0.001" defaultValue="0" /></Field><Field label="التاريخ"><input type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} disabled /></Field><Field label="رقم المرجع"><input name="reference" placeholder="يُنشأ تلقائيًا عند تركه فارغًا" /></Field><Field label="ملاحظات"><input name="note" /></Field><ImageField {...image} onChange={image.chooseImage} /></FormShell>;
}

function KitchenTransferForm({ data, onDone }: { data: AppData; onDone: () => void }) {
  const [error, setError] = useState(""); const main = stageWarehouse(data, "raw"); const rawItems = data.items.filter((item) => item.stage !== "finished" && (balanceFor(data, main?.id, item.id)?.quantity ?? 0) > 0); const [itemId, setItemId] = useState(rawItems[0]?.id ?? ""); const selected = data.items.find((item) => item.id === itemId); const units = data.units.filter((unit) => selected && unit.family === data.units.find((entry) => entry.id === selected.baseUnitId)?.family); const [unitId, setUnitId] = useState(units[0]?.id ?? ""); const [quantity, setQuantity] = useState(0); const base = data.units.find((unit) => unit.id === selected?.baseUnitId); const entered = data.units.find((unit) => unit.id === unitId); const equivalent = selected && base && entered && quantity > 0 ? convertUnitForDisplay(quantity, entered.baseFactor, base.baseFactor) : 0; const current = selected ? balanceFor(data, main?.id, selected.id)?.quantity ?? 0 : 0;
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await transferToKitchen({ itemId, quantity, enteredUnitId: unitId, reference: String(form.get("reference")), note: String(form.get("note")) }); onDone(); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر التحويل"); } };
  return <FormShell error={error} onSubmit={submit} submitLabel="تحويل إلى المطبخ"><Field label="رقم الإذن"><input name="reference" placeholder="يُنشأ تلقائيًا" /></Field><Field label="التاريخ والتوقيت"><input disabled value={new Date().toLocaleString("ar-EG")} readOnly /></Field><Field label="المادة" full><select value={itemId} onChange={(event) => { const next = data.items.find((item) => item.id === event.target.value); const family = data.units.find((unit) => unit.id === next?.baseUnitId)?.family; setItemId(event.target.value); setUnitId(data.units.find((unit) => unit.family === family)?.id ?? ""); }} required>{rawItems.map((item) => <option key={item.id} value={item.id}>{item.nameAr} — {displayQuantity(data, item, balanceFor(data, main?.id, item.id)?.quantity ?? 0)}</option>)}</select></Field>{selected && <Field label="صورة ورصيد المادة" full><div className="selected-material"><ItemImage item={selected} fallback="🥬" /><div><strong>{selected.nameAr}</strong><small>الرصيد الحالي: {displayQuantity(data, selected, current)}</small></div></div></Field>}<Field label="الكمية المطلوب تحويلها"><input type="number" min="0.001" step="0.001" value={quantity || ""} onChange={(event) => setQuantity(Number(event.target.value))} required /></Field><Field label="الوحدة"><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.nameAr}</option>)}</select></Field><Field label="الكمية المكافئة"><input disabled value={`${formatQuantity(equivalent)} ${base?.symbol ?? ""}`} readOnly /></Field><Field label="الرصيد المتوقع"><input disabled value={`${formatQuantity(Math.max(0, current - equivalent))} ${base?.symbol ?? ""}`} readOnly /></Field><Field label="ملاحظات" full><input name="note" /></Field></FormShell>;
}

function ProductionForm({ data, onDone }: { data: AppData; onDone: (order: ProductionOrder) => void }) {
  const [error, setError] = useState(""); const image = useImagePicker(setError); const kitchen = stageWarehouse(data, "work_in_progress"); const kitchenItems = data.items.filter((item) => item.stage !== "finished" && (balanceFor(data, kitchen?.id, item.id)?.quantity ?? 0) > 0); const [rows, setRows] = useState([{ id: crypto.randomUUID(), itemId: kitchenItems[0]?.id ?? "", quantity: 0, unitId: defaultProductionUnitId(data, kitchenItems[0]) }]);
  const changeRow = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((value) => value.map((row) => row.id === id ? { ...row, ...patch } : row));
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (image.busy) return setError("انتظر تجهيز الصورة"); const form = new FormData(event.currentTarget); try { const outputUnitId = String(form.get("outputUnit")); const outputUnit = data.units.find((unit) => unit.id === outputUnitId); if (!outputUnit) throw new Error("اختر وحدة الناتج"); const baseUnit = [...data.units].filter((unit) => unit.family === outputUnit.family).sort((a, b) => a.baseFactor - b.baseFactor)[0]; const ingredients = rows.filter((row) => row.itemId && row.quantity > 0).map((row) => ({ id: crypto.randomUUID(), itemId: row.itemId, quantity: row.quantity, unitId: row.unitId, wastePercent: Number(form.get("waste") || 0), optional: false })); const recipe = await saveProductionDefinition({ product: { nameAr: String(form.get("nameAr")), nameEn: String(form.get("nameEn") || form.get("nameAr")), code: String(form.get("code")), category: String(form.get("category")), baseUnitId: baseUnit.id, salePricePiasters: Math.round(Number(form.get("price")) * 100), imageDataUrl: image.imageDataUrl || undefined }, outputQuantity: Number(form.get("outputQuantity")), outputUnitId, ingredients }); const order = await executeProduction({ recipeId: recipe.id, batches: 1 }); onDone(order); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تنفيذ التصنيع"); } };
  const outputUnits = data.units.filter((unit) => unit.family === "count" || unit.family === "mass");
  return <FormShell error={error} onSubmit={submit} submitLabel="تنفيذ أمر التصنيع"><Field label="اسم المنتج التام"><input name="nameAr" required /></Field><Field label="كود المنتج"><input name="code" required placeholder="FG-001" /></Field><Field label="الاسم بالإنجليزية"><input name="nameEn" /></Field><Field label="التصنيف"><input name="category" required placeholder="وجبات" /></Field><Field label="كمية الناتج"><input name="outputQuantity" type="number" min="0.001" step="0.001" defaultValue="1" required /></Field><Field label="وحدة الناتج"><select name="outputUnit">{outputUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.nameAr}</option>)}</select></Field><Field label="سعر البيع المقترح بالجنيه"><input name="price" type="number" min="0" step="0.01" required /></Field><Field label="نسبة الهالك الاختيارية"><input name="waste" type="number" min="0" max="100" step="0.1" defaultValue="0" /></Field><ImageField {...image} onChange={image.chooseImage} /><Field label="مكونات التصنيع من المطبخ — الأوزان تُحفظ بالجرام" full><div className="ingredient-builder">{rows.map((row) => { const item = data.items.find((entry) => entry.id === row.itemId); const unitOptions = productionUnitOptions(data, item); const selectedUnit = data.units.find((unit) => unit.id === row.unitId); const baseUnit = data.units.find((unit) => unit.id === item?.baseUnitId); const quantityInBase = selectedUnit && baseUnit && selectedUnit.family === baseUnit.family ? convertUnitForDisplay(row.quantity, selectedUnit.baseFactor, baseUnit.baseFactor) : 0; const balance = item ? balanceFor(data, kitchen?.id, item.id) : undefined; return <div className="ingredient-row" key={row.id}><select value={row.itemId} onChange={(event) => { const next = data.items.find((entry) => entry.id === event.target.value); changeRow(row.id, { itemId: event.target.value, unitId: defaultProductionUnitId(data, next) }); }}>{kitchenItems.map((entry) => <option key={entry.id} value={entry.id}>{entry.nameAr} — متاح {displayQuantity(data, entry, balanceFor(data, kitchen?.id, entry.id)?.quantity ?? 0)}</option>)}</select><input type="number" min="0.001" step="0.001" placeholder="الكمية" value={row.quantity || ""} onChange={(event) => changeRow(row.id, { quantity: Number(event.target.value) })} /><select aria-label="وحدة سحب مكون التصنيع" value={row.unitId} onChange={(event) => changeRow(row.id, { unitId: event.target.value })}>{unitOptions.map(({ unit, compatible }) => <option key={unit.id} value={unit.id} disabled={!compatible}>{unit.nameAr}{compatible ? "" : " — غير متوافق مع الصنف"}</option>)}</select><span>{item ? formatMoney((balance?.averageCostPiasters ?? item.averageCostPiasters) * quantityInBase) : "—"}</span><button type="button" className="btn small danger" onClick={() => setRows((value) => value.filter((entry) => entry.id !== row.id))}>حذف</button></div>; })}<button type="button" className="btn small" onClick={() => setRows((value) => [...value, { id: crypto.randomUUID(), itemId: kitchenItems[0]?.id ?? "", quantity: 0, unitId: defaultProductionUnitId(data, kitchenItems[0]) }])}>＋ إضافة مكون</button></div></Field><Field label="ملاحظات" full><input name="notes" /></Field></FormShell>;
}

function ReceiptDialog({ sale, onClose }: { sale: SaleOrder; onClose: () => void }) {
  const [settings, setSettings] = useState<AppSettings>();
  useEffect(() => { db.settings.get("settings").then(setSettings); }, []);
  const totalQuantity = sale.items.reduce((sum, item) => sum + item.quantity, 0); const paymentLabel = sale.paymentMethod === "cash" ? "نقدي" : sale.paymentMethod === "card" ? "بطاقة" : "محفظة إلكترونية";
  return <div className="receipt-backdrop" role="dialog" aria-modal="true"><article className="receipt-sheet"><header className="receipt-header"><BrandLogo settings={settings} /><div><h2>{settings?.restaurantName ?? "RestaurantFlow"}</h2><p>الفرع الرئيسي · إيصال بيع</p></div></header><div className="receipt-meta"><div><span>رقم الطلب</span><strong>{sale.number}</strong></div><div><span>التاريخ والوقت</span><strong>{new Date(sale.createdAt).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}</strong></div><div><span>نوع الطلب</span><strong>تيك أواي</strong></div><div><span>طريقة الدفع</span><strong>{paymentLabel}</strong></div></div><table className="receipt-table"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>{sale.items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.quantity}</td><td>{formatMoney(item.unitPricePiasters)}</td><td>{formatMoney(item.unitPricePiasters * item.quantity)}</td></tr>)}</tbody></table><div className="receipt-counts"><span>عدد الأصناف: <strong>{sale.items.length}</strong></span><span>إجمالي الكميات: <strong>{totalQuantity}</strong></span></div><div className="receipt-totals"><div><span>الإجمالي الفرعي</span><strong>{formatMoney(sale.subtotalPiasters)}</strong></div><div><span>الضريبة 14%</span><strong>{formatMoney(sale.taxPiasters)}</strong></div><div className="receipt-grand"><span>الإجمالي</span><strong>{formatMoney(sale.totalPiasters)}</strong></div></div><p className="receipt-thanks">شكرًا لزيارتكم — نتمنى لكم وجبة سعيدة</p><div className="receipt-actions"><button className="btn" onClick={onClose}>طلب جديد</button><button className="btn primary" onClick={() => window.print()}>طباعة الإيصال</button></div></article></div>;
}
