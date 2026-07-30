"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { db } from "@/src/db/database";
import { ensureSeedData, resetDemoData } from "@/src/db/seed";
import { calculateRecipeCost, completeSale, executeProduction } from "@/src/domain/inventory-service";
import type {
  InventoryItem,
  OrderItem,
  ProductionOrder,
  Recipe,
  StockBalance,
  StockMovement,
  UnitOfMeasure,
  Warehouse,
} from "@/src/domain/models";
import { formatMoney, formatQuantity } from "@/src/lib/money";

type Section = "units" | "items" | "warehouses" | "recipes" | "production" | "movements" | "costing" | "pos";
type ModalName = "unit" | "item" | "warehouse" | "recipe" | "production" | null;

const navItems: { id: Section; icon: string; label: string; eyebrow: string }[] = [
  { id: "units", icon: "⌁", label: "الوحدات", eyebrow: "01 · البنية الأساسية" },
  { id: "items", icon: "◇", label: "المواد", eyebrow: "02 · دليل المخزون" },
  { id: "warehouses", icon: "▦", label: "المخازن", eyebrow: "03 · مواقع التخزين" },
  { id: "recipes", icon: "◎", label: "الوصفات", eyebrow: "04 · هندسة المنتج" },
  { id: "production", icon: "⚙", label: "التصنيع", eyebrow: "05 · أوامر الإنتاج" },
  { id: "movements", icon: "⇄", label: "حركات المخزون", eyebrow: "06 · سجل غير قابل للتعديل" },
  { id: "costing", icon: "◒", label: "التكلفة", eyebrow: "07 · ربحية المنتجات" },
  { id: "pos", icon: "▤", label: "الكاشير", eyebrow: "08 · نقطة البيع" },
];

const stageLabels = {
  raw: "مواد خام",
  work_in_progress: "تحت التشغيل",
  finished: "منتج تام",
};

const movementLabels: Record<string, string> = {
  opening: "رصيد افتتاحي",
  purchase: "مشتريات",
  production_consume: "صرف تصنيع",
  production_output: "ناتج تصنيع",
  sale: "مبيعات",
  adjustment: "تسوية",
  waste: "هالك",
};

interface AppData {
  units: UnitOfMeasure[];
  items: InventoryItem[];
  warehouses: Warehouse[];
  balances: StockBalance[];
  recipes: Recipe[];
  movements: StockMovement[];
  productionOrders: ProductionOrder[];
}

const emptyData: AppData = { units: [], items: [], warehouses: [], balances: [], recipes: [], movements: [], productionOrders: [] };

export function RestaurantFlowApp() {
  const [section, setSection] = useState<Section>("units");
  const [modal, setModal] = useState<ModalName>(null);
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [payment, setPayment] = useState<"cash" | "card" | "wallet">("cash");

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const refresh = useCallback(async () => {
    const [units, items, warehouses, balances, recipes, movements, productionOrders] = await Promise.all([
      db.units.toArray(),
      db.items.toArray(),
      db.warehouses.toArray(),
      db.balances.toArray(),
      db.recipes.toArray(),
      db.movements.orderBy("createdAt").reverse().toArray(),
      db.productionOrders.orderBy("createdAt").reverse().toArray(),
    ]);
    setData({ units, items, warehouses, balances, recipes, movements, productionOrders });
  }, []);

  useEffect(() => {
    ensureSeedData().then(refresh).then(() => setReady(true)).catch((error) => notify(error.message, true));
  }, [notify, refresh]);

  const activeNav = navItems.find((item) => item.id === section)!;
  const filteredItems = useMemo(() => {
    const value = query.trim().toLowerCase();
    return !value ? data.items : data.items.filter((item) => `${item.nameAr} ${item.nameEn} ${item.code} ${item.category}`.toLowerCase().includes(value));
  }, [data.items, query]);

  const unitName = (id: string) => data.units.find((x) => x.id === id)?.symbol ?? "—";
  const itemName = (id: string) => data.items.find((x) => x.id === id)?.nameAr ?? "مادة محذوفة";
  const recipeCost = (recipe: Recipe) => recipe.ingredients.reduce((sum, ingredient) => {
    const item = data.items.find((x) => x.id === ingredient.itemId);
    return sum + Math.round((item?.averageCostPiasters ?? 0) * ingredient.quantity * (1 + ingredient.wastePercent / 100));
  }, 0);

  const reset = async () => {
    if (!window.confirm("سيتم حذف التغييرات المحلية وإعادة البيانات التجريبية. هل تريد المتابعة؟")) return;
    await resetDemoData();
    await refresh();
    setCart([]);
    notify("تمت استعادة البيانات التجريبية");
  };

  const exportBackup = async () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      units: await db.units.toArray(),
      items: await db.items.toArray(),
      warehouses: await db.warehouses.toArray(),
      balances: await db.balances.toArray(),
      recipes: await db.recipes.toArray(),
      movements: await db.movements.toArray(),
      productionOrders: await db.productionOrders.toArray(),
      saleOrders: await db.saleOrders.toArray(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `restaurantflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify("تم تصدير النسخة الاحتياطية");
  };

  if (!ready) {
    return <div className="loading"><div className="loading-card"><div className="loader" /><strong>جاري تجهيز RestaurantFlow</strong><p className="page-sub">تحميل قاعدة البيانات المحلية…</p></div></div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div><strong>RestaurantFlow</strong><small>SMART RESTAURANT OS</small></div>
        </div>
        <div className="nav-label">دورة المخزون والتشغيل</div>
        <nav className="nav" aria-label="التنقل الرئيسي">
          {navItems.map((item) => (
            <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setQuery(""); }}>
              <span>{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="user-card">
          <div className="avatar">م</div>
          <div><strong>محمود السيد</strong><small>مالك النظام</small></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="branch"><span className="branch-dot" /><div><strong>فرع الزمالك</strong><small>متصل · البيانات محفوظة محليًا</small></div></div>
          <div className="top-actions">
            <button className="chip" onClick={exportBackup}>↓ نسخة احتياطية</button>
            <button className="chip" onClick={reset}>↻ بيانات تجريبية</button>
            <span className="chip shift-chip">● وردية مفتوحة</span>
            <button className="icon-btn" title="تبديل المظهر">☼</button>
          </div>
        </header>

        <div className="content">
          <div className="flow-steps" aria-label="تسلسل النظام">
            {navItems.map((item, index) => <span key={item.id} style={{ display: "contents" }}>
              <span className={`flow-step ${navItems.findIndex((x) => x.id === section) >= index ? "done" : ""}`}><b>{index + 1}</b>{item.label}</span>
              {index < navItems.length - 1 && <span className="flow-arrow">←</span>}
            </span>)}
          </div>
          <div className="page-head">
            <div><p className="eyebrow">{activeNav.eyebrow}</p><h1>{activeNav.label}</h1><p className="page-sub">{sectionDescription(section)}</p></div>
            <div className="head-actions">
              {section === "units" && <button className="btn primary" onClick={() => setModal("unit")}>＋ وحدة جديدة</button>}
              {section === "items" && <button className="btn primary" onClick={() => setModal("item")}>＋ مادة جديدة</button>}
              {section === "warehouses" && <button className="btn primary" onClick={() => setModal("warehouse")}>＋ مخزن جديد</button>}
              {section === "recipes" && <button className="btn primary" onClick={() => setModal("recipe")}>＋ وصفة جديدة</button>}
              {section === "production" && <button className="btn primary" onClick={() => setModal("production")}>⚙ أمر تصنيع</button>}
            </div>
          </div>

          {section === "units" && <UnitsView data={data} query={query} setQuery={setQuery} notify={notify} refresh={refresh} />}
          {section === "items" && <ItemsView items={filteredItems} balances={data.balances} units={data.units} query={query} setQuery={setQuery} refresh={refresh} notify={notify} />}
          {section === "warehouses" && <WarehousesView data={data} />}
          {section === "recipes" && <RecipesView data={data} recipeCost={recipeCost} />}
          {section === "production" && <ProductionView data={data} itemName={itemName} />}
          {section === "movements" && <MovementsView data={data} itemName={itemName} unitName={unitName} />}
          {section === "costing" && <CostingView data={data} recipeCost={recipeCost} />}
          {section === "pos" && <PosView data={data} cart={cart} setCart={setCart} payment={payment} setPayment={setPayment} refresh={refresh} notify={notify} />}
        </div>
      </main>

      {modal && <Modal title={modalTitle(modal)} onClose={() => setModal(null)}>
        {modal === "unit" && <UnitForm onDone={async () => { setModal(null); await refresh(); notify("تمت إضافة الوحدة بنجاح"); }} />}
        {modal === "item" && <ItemForm data={data} onDone={async () => { setModal(null); await refresh(); notify("تمت إضافة المادة بنجاح"); }} />}
        {modal === "warehouse" && <WarehouseForm onDone={async () => { setModal(null); await refresh(); notify("تمت إضافة المخزن بنجاح"); }} />}
        {modal === "recipe" && <RecipeForm data={data} onDone={async () => { setModal(null); await refresh(); notify("تم إنشاء الوصفة وحساب تكلفتها"); }} />}
        {modal === "production" && <ProductionForm data={data} onDone={async (order) => { setModal(null); await refresh(); notify(`تم تنفيذ ${order.number} بتكلفة ${formatMoney(order.totalCostPiasters)}`); }} />}
      </Modal>}
      {toast && <div className={`toast ${toast.error ? "error" : ""}`}>{toast.error ? "⚠ " : "✓ "}{toast.text}</div>}
    </div>
  );
}

function sectionDescription(section: Section) {
  const descriptions: Record<Section, string> = {
    units: "عرّف وحدات القياس والتحويلات بين وحدات الشراء والتخزين.",
    items: "دليل موحّد للمواد الخام وتحت التشغيل والمنتجات التامة.",
    warehouses: "راقب أرصدة المخازن الثلاثة وقيمة المخزون لحظيًا.",
    recipes: "وصفات ديناميكية بتكلفة تلقائية ونسب هالك قابلة للتعديل.",
    production: "حوّل المواد الخام إلى ناتج فعلي في معاملة ذرّية واحدة.",
    movements: "كل خصم وإضافة موثّق بمرجع وتكلفة وتوقيت العملية.",
    costing: "قارن تكلفة الوصفة بسعر البيع واكتشف هامش الربح.",
    pos: "واجهة بيع سريعة للمس مع خصم مكونات الوصفة تلقائيًا.",
  };
  return descriptions[section];
}

function Stat({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: string }) {
  return <div className="stat"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><small>{hint}</small></div>;
}

function SearchBar({ value, onChange, placeholder = "بحث بالاسم أو الكود…" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="toolbar"><div className="search"><input aria-label="بحث" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div><button className="filter">≡ تصفية</button></div>;
}

function UnitsView({ data, query, setQuery, notify, refresh }: { data: AppData; query: string; setQuery: (v: string) => void; notify: (v: string, e?: boolean) => void; refresh: () => Promise<void> }) {
  const units = data.units.filter((x) => `${x.nameAr} ${x.code} ${x.symbol}`.toLowerCase().includes(query.toLowerCase()));
  const deactivate = async (unit: UnitOfMeasure) => {
    const used = data.items.some((x) => x.baseUnitId === unit.id || x.purchaseUnitId === unit.id);
    if (used) return notify("لا يمكن حذف وحدة مستخدمة؛ تم الإبقاء عليها لحماية البيانات", true);
    await db.units.delete(unit.id); await refresh(); notify("تم حذف الوحدة");
  };
  return <>
    <div className="stats">
      <Stat label="إجمالي الوحدات" value={String(data.units.length)} hint="وحدات نشطة" icon="⌁" />
      <Stat label="وحدات الوزن" value={String(data.units.filter((x) => x.family === "mass").length)} hint="جرام وكيلوجرام" icon="㎏" />
      <Stat label="وحدات الحجم" value={String(data.units.filter((x) => x.family === "volume").length)} hint="ملليلتر ولتر" icon="ℓ" />
      <Stat label="التحويلات" value="2" hint="تحويلات أساسية مفعلة" icon="⇄" />
    </div>
    <div className="panel">
      <div className="panel-head"><div><h2>وحدات القياس</h2><small>معامل الوحدة محسوب مقابل أصغر وحدة في العائلة</small></div><span className="badge green"><span className="dot" /> محفوظ محليًا</span></div>
      <div className="panel-body">
        <SearchBar value={query} onChange={setQuery} />
        <div className="table-wrap"><table><thead><tr><th>الوحدة</th><th>الكود</th><th>الرمز</th><th>العائلة</th><th>المعامل الأساسي</th><th>الحالة</th><th /></tr></thead>
          <tbody>{units.map((unit) => <tr key={unit.id}><td className="item-name"><strong>{unit.nameAr}</strong><small>{unit.nameEn}</small></td><td>{unit.code}</td><td>{unit.symbol}</td><td>{unit.family === "mass" ? "وزن" : unit.family === "volume" ? "حجم" : "عدد"}</td><td>{formatQuantity(unit.baseFactor)}</td><td><span className="badge green"><span className="dot" /> نشطة</span></td><td><button className="btn small danger" onClick={() => deactivate(unit)}>حذف</button></td></tr>)}</tbody>
        </table></div>
      </div>
    </div>
  </>;
}

function ItemsView({ items, balances, units, query, setQuery, refresh, notify }: { items: InventoryItem[]; balances: StockBalance[]; units: UnitOfMeasure[]; query: string; setQuery: (v: string) => void; refresh: () => Promise<void>; notify: (v: string, e?: boolean) => void }) {
  const deactivate = async (item: InventoryItem) => {
    const hasMovements = await db.movements.where("itemId").equals(item.id).count();
    if (hasMovements) {
      await db.items.update(item.id, { active: false, updatedAt: new Date().toISOString() });
      await refresh(); return notify("للمادة حركات مخزون؛ تم تعطيلها بدل حذفها");
    }
    await db.items.delete(item.id); await refresh(); notify("تم حذف المادة");
  };
  return <>
    <div className="stats">
      <Stat label="المواد الخام" value={String(items.filter((x) => x.stage === "raw").length)} hint="صنف مسجل" icon="◇" />
      <Stat label="تحت التشغيل" value={String(items.filter((x) => x.stage === "work_in_progress").length)} hint="تجهيزات داخلية" icon="⚙" />
      <Stat label="المنتجات التامة" value={String(items.filter((x) => x.stage === "finished").length)} hint="جاهزة للبيع" icon="▣" />
      <Stat label="تحت الحد الأدنى" value={String(items.filter((x) => balances.filter((b) => b.itemId === x.id).reduce((s, b) => s + b.quantity, 0) < x.minLevel).length)} hint="تحتاج متابعة" icon="!" />
    </div>
    <div className="panel"><div className="panel-head"><div><h2>دليل المواد</h2><small>الأرصدة لا تُعدّل مباشرة؛ تتغير فقط من خلال الحركات</small></div><span className="badge">{items.length} صنف</span></div>
      <div className="panel-body"><SearchBar value={query} onChange={setQuery} />
        <div className="table-wrap"><table><thead><tr><th>المادة</th><th>المرحلة</th><th>التصنيف</th><th>الرصيد</th><th>متوسط التكلفة</th><th>الحد الأدنى</th><th /></tr></thead>
          <tbody>{items.map((item) => {
            const balance = balances.filter((x) => x.itemId === item.id).reduce((sum, x) => sum + x.quantity, 0);
            const unit = units.find((x) => x.id === item.baseUnitId)?.symbol;
            return <tr key={item.id}><td className="item-name"><strong>{item.nameAr}</strong><small>{item.code} · {item.nameEn}</small></td><td><span className={`badge ${item.stage === "raw" ? "green" : item.stage === "work_in_progress" ? "amber" : "blue"}`}>{stageLabels[item.stage]}</span></td><td>{item.category}</td><td>{formatQuantity(balance)} {unit}</td><td>{formatMoney(item.averageCostPiasters)} / {unit}</td><td>{formatQuantity(item.minLevel)} {unit}</td><td><button className="btn small danger" onClick={() => deactivate(item)}>{item.active ? "تعطيل" : "معطلة"}</button></td></tr>;
          })}</tbody>
        </table></div>
      </div>
    </div>
  </>;
}

function WarehousesView({ data }: { data: AppData }) {
  return <>
    <div className="stats">
      <Stat label="إجمالي المخازن" value={String(data.warehouses.length)} hint="في فرع الزمالك" icon="▦" />
      <Stat label="قيمة المواد الخام" value={formatMoney(data.balances.filter((b) => b.warehouseId === "wh-raw").reduce((s, b) => s + b.quantity * b.averageCostPiasters, 0))} hint="بالقيمة الدفترية" icon="ج" />
      <Stat label="الأرصدة المحجوزة" value={formatQuantity(data.balances.reduce((s, b) => s + b.reserved, 0))} hint="حاليًا" icon="◉" />
      <Stat label="أصناف نشطة" value={String(data.items.filter((x) => x.active).length)} hint="عبر كل المخازن" icon="◇" />
    </div>
    <div className="cards">{data.warehouses.map((warehouse) => {
      const balances = data.balances.filter((x) => x.warehouseId === warehouse.id);
      const value = balances.reduce((s, b) => s + b.quantity * b.averageCostPiasters, 0);
      return <div className="entity-card" key={warehouse.id}><div className="entity-card-top"><div><h3>{warehouse.nameAr}</h3><p>{warehouse.nameEn} · {warehouse.code}</p></div><span className="badge green"><span className="dot" /> نشط</span></div>
        <div className="entity-meta"><span className="badge">{stageLabels[warehouse.stage]}</span><span className="badge">{balances.length} صنف</span></div>
        <div className="progress"><div style={{ width: `${Math.min(100, 20 + balances.length * 15)}%` }} /></div>
        <p>قيمة المخزون: <strong>{formatMoney(value)}</strong></p>
      </div>;
    })}</div>
  </>;
}

function RecipesView({ data, recipeCost }: { data: AppData; recipeCost: (r: Recipe) => number }) {
  return <div className="cards">{data.recipes.map((recipe) => {
    const cost = recipeCost(recipe);
    const margin = recipe.sellingPricePiasters ? Math.round((1 - cost / recipe.sellingPricePiasters) * 100) : null;
    return <div className="entity-card" key={recipe.id}>
      <div className="entity-card-top"><div><h3>{recipe.nameAr}</h3><p>{recipe.code} · الإصدار {recipe.version}</p></div><span className="badge green">نشطة</span></div>
      <div className="entity-meta"><span className="badge">{recipe.ingredients.length} مكونات</span><span className="badge blue">ناتج {formatQuantity(recipe.outputQuantity)} {data.units.find((x) => x.id === recipe.outputUnitId)?.symbol}</span></div>
      <div className="progress"><div style={{ width: `${margin ?? 55}%`, background: margin !== null && margin < 30 ? "#c64545" : undefined }} /></div>
      <p>تكلفة الدفعة: <strong>{formatMoney(cost)}</strong>{margin !== null && <> · هامش <strong>{margin}%</strong></>}</p>
      <div style={{ marginTop: 11 }}>{recipe.ingredients.map((x) => <span className="badge" key={x.id} style={{ margin: "2px" }}>{data.items.find((i) => i.id === x.itemId)?.nameAr} · {formatQuantity(x.quantity)}</span>)}</div>
    </div>;
  })}</div>;
}

function ProductionView({ data, itemName }: { data: AppData; itemName: (id: string) => string }) {
  return <>
    <div className="stats">
      <Stat label="أوامر مكتملة" value={String(data.productionOrders.length)} hint="منذ بدء التجربة" icon="✓" />
      <Stat label="إجمالي تكلفة الإنتاج" value={formatMoney(data.productionOrders.reduce((s, x) => s + x.totalCostPiasters, 0))} hint="تكلفة فعلية" icon="ج" />
      <Stat label="الهالك المسجل" value={formatQuantity(data.productionOrders.reduce((s, x) => s + x.wasteQuantity, 0))} hint="فرق المخطط والفعلي" icon="△" />
      <Stat label="وصفات جاهزة" value={String(data.recipes.filter((x) => x.active).length)} hint="قابلة للتنفيذ" icon="◎" />
    </div>
    <div className="panel"><div className="panel-head"><div><h2>أوامر التصنيع</h2><small>خصم المدخلات وإضافة الناتج يتمان داخل معاملة واحدة</small></div></div>
      {data.productionOrders.length ? <div className="table-wrap"><table><thead><tr><th>رقم الأمر</th><th>الناتج</th><th>المخطط</th><th>الفعلي</th><th>إجمالي التكلفة</th><th>تكلفة الوحدة</th><th>الحالة</th></tr></thead>
        <tbody>{data.productionOrders.map((order) => {
          const recipe = data.recipes.find((x) => x.id === order.recipeId);
          return <tr key={order.id}><td><strong>{order.number}</strong></td><td>{itemName(recipe?.outputItemId ?? "")}</td><td>{formatQuantity(order.plannedQuantity)}</td><td>{formatQuantity(order.actualQuantity)}</td><td>{formatMoney(order.totalCostPiasters)}</td><td>{formatMoney(order.unitCostPiasters)}</td><td><span className="badge green">✓ مكتمل</span></td></tr>;
        })}</tbody></table></div> : <Empty icon="⚙" title="لا توجد أوامر تصنيع بعد" text="أنشئ أول أمر؛ سيتحقق النظام من الأرصدة ثم ينفذ الحركات تلقائيًا." />}
    </div>
  </>;
}

function MovementsView({ data, itemName, unitName }: { data: AppData; itemName: (id: string) => string; unitName: (id: string) => string }) {
  return <div className="panel"><div className="panel-head"><div><h2>سجل حركات المخزون</h2><small>دفتر تدقيق للقراءة فقط — أحدث حركة أولًا</small></div><span className="badge">{data.movements.length} حركة</span></div>
    <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>المرجع</th><th>نوع الحركة</th><th>المادة</th><th>المخزن</th><th>الكمية</th><th>القيمة</th></tr></thead>
      <tbody>{data.movements.map((movement) => {
        const item = data.items.find((x) => x.id === movement.itemId);
        return <tr key={movement.id}><td>{new Date(movement.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</td><td><strong>{movement.reference}</strong></td><td><span className={`badge ${movement.quantity > 0 ? "green" : "amber"}`}>{movementLabels[movement.type]}</span></td><td>{itemName(movement.itemId)}</td><td>{data.warehouses.find((x) => x.id === movement.warehouseId)?.nameAr}</td><td style={{ color: movement.quantity > 0 ? "var(--brand)" : "var(--danger)", fontWeight: 800 }}>{movement.quantity > 0 ? "+" : ""}{formatQuantity(movement.quantity)} {unitName(item?.baseUnitId ?? "")}</td><td>{formatMoney(Math.abs(movement.totalCostPiasters))}</td></tr>;
      })}</tbody>
    </table></div>
  </div>;
}

function CostingView({ data, recipeCost }: { data: AppData; recipeCost: (r: Recipe) => number }) {
  const priced = data.recipes.filter((x) => x.sellingPricePiasters);
  return <>
    <div className="stats">
      <Stat label="متوسط هامش الربح" value={`${priced.length ? Math.round(priced.reduce((s, r) => s + (1 - recipeCost(r) / (r.sellingPricePiasters || 1)) * 100, 0) / priced.length) : 0}%`} hint="على الوصفات المسعرة" icon="↗" />
      <Stat label="قيمة المخزون" value={formatMoney(data.balances.reduce((s, b) => s + b.quantity * b.averageCostPiasters, 0))} hint="متوسط مرجح" icon="ج" />
      <Stat label="وصفات بحاجة تسعير" value={String(data.recipes.filter((x) => !x.sellingPricePiasters).length)} hint="لا يوجد سعر بيع" icon="!" />
      <Stat label="تكلفة آخر إنتاج" value={formatMoney(data.productionOrders[0]?.totalCostPiasters ?? 0)} hint={data.productionOrders[0]?.number ?? "لا توجد أوامر"} icon="⚙" />
    </div>
    <div className="panel"><div className="panel-head"><div><h2>تحليل تكلفة الوصفات</h2><small>الحساب يعتمد على متوسط تكلفة كل مكوّن ونسبة الهالك</small></div></div>
      <div className="table-wrap"><table><thead><tr><th>الوصفة</th><th>تكلفة الدفعة</th><th>تكلفة وحدة الناتج</th><th>سعر البيع</th><th>الربح</th><th>هامش الربح</th></tr></thead>
        <tbody>{data.recipes.map((recipe) => {
          const cost = recipeCost(recipe); const unitCost = Math.round(cost / recipe.outputQuantity); const price = recipe.sellingPricePiasters; const margin = price ? Math.round((1 - unitCost / price) * 100) : null;
          return <tr key={recipe.id}><td className="item-name"><strong>{recipe.nameAr}</strong><small>{recipe.code}</small></td><td>{formatMoney(cost)}</td><td>{formatMoney(unitCost)}</td><td>{price ? formatMoney(price) : "غير محدد"}</td><td>{price ? formatMoney(price - unitCost) : "—"}</td><td>{margin !== null ? <span className={`badge ${margin >= 30 ? "green" : "amber"}`}>{margin}%</span> : "—"}</td></tr>;
        })}</tbody>
      </table></div>
    </div>
  </>;
}

function PosView({ data, cart, setCart, payment, setPayment, refresh, notify }: { data: AppData; cart: OrderItem[]; setCart: React.Dispatch<React.SetStateAction<OrderItem[]>>; payment: "cash" | "card" | "wallet"; setPayment: (v: "cash" | "card" | "wallet") => void; refresh: () => Promise<void>; notify: (v: string, e?: boolean) => void }) {
  const products = data.items.filter((x) => x.stage === "finished" && x.active && x.salePricePiasters);
  const add = (product: InventoryItem) => setCart((current) => {
    const exists = current.find((x) => x.itemId === product.id);
    if (exists) return current.map((x) => x.itemId === product.id ? { ...x, quantity: x.quantity + 1 } : x);
    return [...current, { id: crypto.randomUUID(), itemId: product.id, name: product.nameAr, quantity: 1, unitPricePiasters: product.salePricePiasters ?? 0, costPiasters: product.averageCostPiasters }];
  });
  const changeQty = (id: string, delta: number) => setCart((current) => current.map((x) => x.id === id ? { ...x, quantity: x.quantity + delta } : x).filter((x) => x.quantity > 0));
  const subtotal = cart.reduce((s, x) => s + x.unitPricePiasters * x.quantity, 0);
  const tax = Math.round(subtotal * .14);
  const checkout = async () => {
    if (!cart.length) return;
    try {
      const sale = await completeSale({ type: "takeaway", items: cart, subtotalPiasters: subtotal, taxPiasters: tax, totalPiasters: subtotal + tax, paymentMethod: payment });
      setCart([]); await refresh(); notify(`تم تحصيل الفاتورة ${sale.number} بنجاح`);
    } catch (error) { notify(error instanceof Error ? error.message : "تعذر إتمام الطلب", true); }
  };
  return <div className="pos-layout">
    <div><div className="toolbar"><div className="search"><input placeholder="ابحث عن منتج أو امسح الباركود…" /></div><button className="filter">كل الأقسام</button></div>
      <div className="product-grid">{products.map((product, index) => <button className="product" key={product.id} onClick={() => add(product)}>
        <span className="product-visual">{["🍕", "🍝", "☕", "🥪"][index % 4]}</span><strong>{product.nameAr}</strong><small className="page-sub">{product.category}</small><span>{formatMoney(product.salePricePiasters ?? 0)}</span>
      </button>)}</div>
    </div>
    <div className="panel cart"><div className="panel-head"><div><h2>الطلب الحالي</h2><small>تيك أواي · طلب جديد</small></div><span className="badge green">{cart.reduce((s, x) => s + x.quantity, 0)} أصناف</span></div>
      {cart.length ? <div className="cart-list">{cart.map((line) => <div className="cart-row" key={line.id}><div><strong>{line.name}</strong><small>{formatMoney(line.unitPricePiasters)} × {line.quantity}</small><div className="qty"><button onClick={() => changeQty(line.id, -1)}>−</button><b>{line.quantity}</b><button onClick={() => changeQty(line.id, 1)}>＋</button></div></div><strong>{formatMoney(line.unitPricePiasters * line.quantity)}</strong></div>)}</div> : <Empty icon="▤" title="الطلب فارغ" text="اضغط على أي منتج لإضافته." />}
      <div className="cart-total"><div className="total-line"><span>الإجمالي الفرعي</span><strong>{formatMoney(subtotal)}</strong></div><div className="total-line"><span>الضريبة 14%</span><strong>{formatMoney(tax)}</strong></div><div className="total-line grand"><span>الإجمالي</span><strong>{formatMoney(subtotal + tax)}</strong></div>
        <div className="pay-methods">{(["cash", "card", "wallet"] as const).map((value) => <button key={value} className={payment === value ? "active" : ""} onClick={() => setPayment(value)}>{value === "cash" ? "نقدي" : value === "card" ? "بطاقة" : "محفظة"}</button>)}</div>
        <button className="btn primary checkout" disabled={!cart.length} onClick={checkout}>تحصيل {formatMoney(subtotal + tax)}</button>
      </div>
    </div>
  </div>;
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="empty"><span>{icon}</span><strong>{title}</strong><p>{text}</p></div>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="close" onClick={onClose}>×</button></div>{children}</div></div>;
}

function FormShell({ children, error, onSubmit }: { children: ReactNode; error: string; onSubmit: (e: FormEvent<HTMLFormElement>) => void | Promise<void> }) {
  return <form onSubmit={onSubmit}>{<div className="modal-body">{error && <div className="form-error">{error}</div>}<div className="form-grid">{children}</div></div>}<div className="modal-foot"><button type="submit" className="btn primary">حفظ وتنفيذ</button></div></form>;
}

function Field({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) {
  return <div className={`field ${full ? "full" : ""}`}><label>{label}</label>{children}</div>;
}

function UnitForm({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    try {
      const now = new Date().toISOString();
      await db.units.add({ id: crypto.randomUUID(), code: String(form.get("code")).toUpperCase(), nameAr: String(form.get("nameAr")), nameEn: String(form.get("nameEn")), symbol: String(form.get("symbol")), family: form.get("family") as UnitOfMeasure["family"], baseFactor: Number(form.get("factor")), active: true, createdAt: now, updatedAt: now, createdBy: "demo-owner" });
      onDone();
    } catch { setError("تحقق من البيانات؛ قد يكون الكود مستخدمًا بالفعل."); }
  };
  return <FormShell error={error} onSubmit={submit}><Field label="الاسم بالعربية"><input name="nameAr" required placeholder="مثال: كيلوجرام" /></Field><Field label="الاسم بالإنجليزية"><input name="nameEn" required placeholder="Kilogram" /></Field><Field label="الكود"><input name="code" required placeholder="KG" /></Field><Field label="الرمز"><input name="symbol" required placeholder="كجم" /></Field><Field label="العائلة"><select name="family"><option value="mass">وزن</option><option value="volume">حجم</option><option value="count">عدد</option></select></Field><Field label="المعامل مقابل الوحدة الأصغر"><input name="factor" type="number" min="0.001" step="0.001" defaultValue="1" required /></Field></FormShell>;
}

function ItemForm({ data, onDone }: { data: AppData; onDone: () => void }) {
  const [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    try {
      const now = new Date().toISOString();
      await db.items.add({ id: crypto.randomUUID(), code: String(form.get("code")).toUpperCase(), nameAr: String(form.get("nameAr")), nameEn: String(form.get("nameEn")), category: String(form.get("category")), stage: form.get("stage") as InventoryItem["stage"], baseUnitId: String(form.get("unit")), purchaseUnitId: String(form.get("unit")), purchaseFactor: 1, minLevel: Number(form.get("minLevel")), averageCostPiasters: Math.round(Number(form.get("cost")) * 100), salePricePiasters: form.get("price") ? Math.round(Number(form.get("price")) * 100) : undefined, active: true, createdAt: now, updatedAt: now, createdBy: "demo-owner" });
      onDone();
    } catch { setError("تعذر حفظ المادة. تأكد من الكود والقيم المطلوبة."); }
  };
  return <FormShell error={error} onSubmit={submit}><Field label="الاسم بالعربية"><input name="nameAr" required /></Field><Field label="الاسم بالإنجليزية"><input name="nameEn" required /></Field><Field label="كود المادة"><input name="code" required placeholder="RM-005" /></Field><Field label="التصنيف"><input name="category" required placeholder="خضروات" /></Field><Field label="مرحلة المخزون"><select name="stage"><option value="raw">مواد خام</option><option value="work_in_progress">تحت التشغيل</option><option value="finished">منتج تام</option></select></Field><Field label="الوحدة الأساسية"><select name="unit">{data.units.map((x) => <option key={x.id} value={x.id}>{x.nameAr}</option>)}</select></Field><Field label="الحد الأدنى"><input name="minLevel" type="number" min="0" step=".001" defaultValue="0" /></Field><Field label="متوسط تكلفة الوحدة (ج.م)"><input name="cost" type="number" min="0" step=".01" defaultValue="0" /></Field><Field label="سعر البيع للمنتج التام (اختياري)" full><input name="price" type="number" min="0" step=".01" /></Field></FormShell>;
}

function WarehouseForm({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const now = new Date().toISOString();
    try { await db.warehouses.add({ id: crypto.randomUUID(), code: String(form.get("code")).toUpperCase(), nameAr: String(form.get("nameAr")), nameEn: String(form.get("nameEn")), stage: form.get("stage") as Warehouse["stage"], branchName: "فرع الزمالك", active: true, createdAt: now, updatedAt: now, createdBy: "demo-owner" }); onDone(); }
    catch { setError("تعذر إضافة المخزن. راجع الكود والبيانات."); }
  };
  return <FormShell error={error} onSubmit={submit}><Field label="اسم المخزن بالعربية"><input name="nameAr" required /></Field><Field label="الاسم بالإنجليزية"><input name="nameEn" required /></Field><Field label="الكود"><input name="code" required placeholder="WH-04" /></Field><Field label="نوع المخزون"><select name="stage"><option value="raw">مواد خام</option><option value="work_in_progress">تحت التشغيل</option><option value="finished">منتج تام</option></select></Field></FormShell>;
}

function RecipeForm({ data, onDone }: { data: AppData; onDone: () => void }) {
  const [error, setError] = useState("");
  const ingredients = data.items.filter((x) => x.stage !== "finished").slice(0, 3);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const now = new Date().toISOString();
    const selected = ingredients.map((item, index) => ({ item, quantity: Number(form.get(`qty-${index}`)) })).filter((x) => x.quantity > 0);
    if (!selected.length) return setError("أدخل كمية مكوّن واحد على الأقل.");
    try {
      await db.recipes.add({ id: crypto.randomUUID(), code: String(form.get("code")).toUpperCase(), nameAr: String(form.get("nameAr")), outputItemId: String(form.get("outputItem")), outputQuantity: Number(form.get("outputQuantity")), outputUnitId: String(form.get("outputUnit")), sellingPricePiasters: form.get("price") ? Math.round(Number(form.get("price")) * 100) : undefined, version: 1, active: true, ingredients: selected.map(({ item, quantity }) => ({ id: crypto.randomUUID(), itemId: item.id, quantity, unitId: item.baseUnitId, wastePercent: 0, optional: false })), createdAt: now, updatedAt: now, createdBy: "demo-owner" });
      onDone();
    } catch { setError("تعذر إنشاء الوصفة. تأكد من كل الحقول."); }
  };
  return <FormShell error={error} onSubmit={submit}><Field label="اسم الوصفة"><input name="nameAr" required /></Field><Field label="كود الوصفة"><input name="code" required placeholder="REC-004" /></Field><Field label="المنتج الناتج"><select name="outputItem">{data.items.map((x) => <option key={x.id} value={x.id}>{x.nameAr}</option>)}</select></Field><Field label="وحدة الناتج"><select name="outputUnit">{data.units.map((x) => <option key={x.id} value={x.id}>{x.nameAr}</option>)}</select></Field><Field label="كمية الناتج"><input name="outputQuantity" type="number" min=".001" step=".001" defaultValue="1" required /></Field><Field label="سعر البيع (اختياري)"><input name="price" type="number" min="0" step=".01" /></Field><Field label="المكونات والكميات" full><div className="form-grid">{ingredients.map((item, index) => <div className="field" key={item.id}><label>{item.nameAr} ({data.units.find((x) => x.id === item.baseUnitId)?.symbol})</label><input name={`qty-${index}`} type="number" min="0" step=".001" defaultValue="0" /></div>)}</div></Field></FormShell>;
}

function ProductionForm({ data, onDone }: { data: AppData; onDone: (order: ProductionOrder) => void }) {
  const [error, setError] = useState("");
  const [recipeId, setRecipeId] = useState(data.recipes[0]?.id ?? "");
  const [cost, setCost] = useState(0);
  useEffect(() => { if (recipeId) calculateRecipeCost(recipeId).then(setCost); }, [recipeId]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    try { const order = await executeProduction({ recipeId, batches: Number(form.get("batches")), actualQuantity: form.get("actual") ? Number(form.get("actual")) : undefined, sourceWarehouseId: String(form.get("source")), targetWarehouseId: String(form.get("target")) }); onDone(order); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تنفيذ أمر التصنيع"); }
  };
  const recipe = data.recipes.find((x) => x.id === recipeId);
  return <FormShell error={error} onSubmit={submit}><Field label="الوصفة" full><select name="recipe" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>{data.recipes.map((x) => <option key={x.id} value={x.id}>{x.nameAr}</option>)}</select></Field><Field label="عدد الدفعات"><input name="batches" type="number" min="1" step="1" defaultValue="1" /></Field><Field label="الكمية الفعلية (اتركها للمخطط)"><input name="actual" type="number" min=".001" step=".001" placeholder={String(recipe?.outputQuantity ?? 0)} /></Field><Field label="مخزن الصرف"><select name="source">{data.warehouses.map((x) => <option key={x.id} value={x.id}>{x.nameAr}</option>)}</select></Field><Field label="مخزن الناتج"><select name="target" defaultValue={recipe && data.items.find((x) => x.id === recipe.outputItemId)?.stage === "finished" ? "wh-fg" : "wh-wip"}>{data.warehouses.map((x) => <option key={x.id} value={x.id}>{x.nameAr}</option>)}</select></Field><Field label="التكلفة التقديرية للدفعة" full><div className="stat"><strong>{formatMoney(cost)}</strong><small>تتحدث آليًا حسب متوسط تكلفة المكونات</small></div></Field></FormShell>;
}

function modalTitle(modal: Exclude<ModalName, null>) {
  return { unit: "إضافة وحدة قياس", item: "إضافة مادة جديدة", warehouse: "إنشاء مخزن", recipe: "إنشاء وصفة ديناميكية", production: "تنفيذ أمر تصنيع" }[modal];
}
