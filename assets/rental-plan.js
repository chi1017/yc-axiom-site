// 網站租用方案價格（編輯器、會員專區「我的網站」、後台確認收款共用）。
// 價格由後台「價格與活動」設定（資料表 site_settings），建置網站時由 tools/apply-settings.mjs 改寫下面兩行標記之間的內容；
// 這裡的預設值只在本機或建置前使用。不要手改價格，請到後台修改。
// 早鳥期間開始租用的網站有 price_lock（rental_sites.price_lock），續約、升級、加購都用鎖定的價格。
// 必須與 yc-axiom-sites 的 supabase/functions/_shared/pricing.mjs 的計算方式一致。
// @yc-settings-begin
const S = {"early":true,"until":"2027/2/3","single":{"month":599,"year":5990},"multi":{"month":899,"year":8990},"pro":{"month":400,"year":4000},"regular":{"single":{"month":700,"year":7000},"multi":{"month":1000,"year":10000}},"terms_version":"2026-11-v9-default"};
// @yc-settings-end

export const SETTINGS = S;
export const EARLY = !!S.early;
export const EARLY_BIRD_UNTIL = S.until;
export const TERMS_VERSION = S.terms_version;
export const money = (n) => 'NT$' + Number(n).toLocaleString('en-US');

// 這個網站適用的價格：有鎖定價（早鳥客人）就用鎖定價，否則用目前的價格
export function pricesFor(lock) {
  if (lock && lock.single_month) {
    return { single: { month: lock.single_month, year: lock.single_year }, multi: { month: lock.multi_month, year: lock.multi_year }, pro: { month: lock.pro_month || S.pro.month, year: lock.pro_year || S.pro.year }, locked: true };
  }
  return { single: S.single, multi: S.multi, pro: S.pro, locked: false };
}

const BASE = {
  single: { id: 'self', layout: 'single', name: '一頁版' },
  multi: { id: 'self-multi', layout: 'multi', name: '多頁版', selectable: true }
};
export function planFor(layout, lock) {
  const k = layout === 'multi' ? 'multi' : 'single', p = pricesFor(lock)[k];
  return { ...BASE[k], monthly: p.month, yearly: p.year };
}
export const PLANS = { single: planFor('single'), multi: planFor('multi') };
export const PLAN = PLANS.single;   // 相容舊的呼叫方式
export const PRO_ADDON = { name: '進階功能', monthly: S.pro.month, yearly: S.pro.year };
export function proFor(lock) { const p = pricesFor(lock).pro; return { name: '進階功能', monthly: p.month, yearly: p.year }; }

export function hasPrice(plan) { return !!plan && typeof plan.monthly === 'number' && plan.monthly > 0; }

// 早鳥進行中才有「早鳥價 NT$xxx／月（至 yyyy/m/d）」；結束後是 null，畫面只顯示一般價格
export const earlyBird = S.early ? (monthly) => '早鳥價 ' + money(monthly) + '／月（至 ' + S.until + '）' : null;

export const monthlyOf = (layout, tier, lock) => planFor(layout, lock).monthly + (tier === 'pro' ? proFor(lock).monthly : 0);
export const yearlyOf = (layout, tier, lock) => planFor(layout, lock).yearly + (tier === 'pro' ? proFor(lock).yearly : 0);

// 「一次付 12 個月…」：年繳剛好等於整數個月時說「只收 N 個月」
export function yearText(layout, tier, lock) {
  const m = monthlyOf(layout, tier, lock), y = yearlyOf(layout, tier, lock), k = y / m;
  return Number.isInteger(k) && k < 12 ? '一次付 12 個月只收 ' + k + ' 個月：' + money(y) : '一次付 12 個月：' + money(y);
}

// 依租用月數算應付金額：每滿 12 個月用年繳價，其餘月份按月計算
export function quote(months, layout, tier, lock) {
  const P = planFor(layout, lock);
  if (!hasPrice(P)) return null;
  const n = Math.floor(Number(months));
  if (!Number.isFinite(n) || n < 1) return null;
  const monthly = monthlyOf(layout, tier, lock), yearly = yearlyOf(layout, tier, lock);
  const years = Math.floor(n / 12), amount = years * yearly + (n % 12) * monthly;
  const paid = amount / monthly;
  const paidMonths = Number.isInteger(paid) ? paid : null;
  return { months: n, amount, monthly, yearly, paidMonths, freeMonths: paidMonths == null ? 0 : n - paidMonths };
}

export const YEAR_AMOUNT = quote(12).amount;
