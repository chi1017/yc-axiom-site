// 網站租用方案（價格的唯一來源）。
// 編輯器、會員專區「我的網站」、後台確認收款都從這裡讀，改價格只要改這個檔案。
// 靜態頁面（/rental/、/pricing/、首頁與常見問題）的價格文字是手寫的，改價格時要一起改。
//
// 兩種版型（與 yc-axiom-sites 的 templates/shared/pages.js、資料庫 rental_sites.layout 對應）：
//   single：一頁版（目前上線中的方案）
//   multi ：多頁版。月費尚未定案，monthly 為 null 時代表「還沒開放、不顯示價格」，quote() 會回傳 null。
//           定案後只要填 listMonthly 與 monthly；一頁升級多頁不另收費，月費自下一期改用多頁價。
export const PLANS = {
  single: {
    id: 'self',
    layout: 'single',
    name: '自架版',
    listMonthly: 690,   // 原價（顯示時以紅色斜線劃掉）
    monthly: 599,       // 目前特價，每月
    yearPaidMonths: 10  // 一次付 12 個月，只收 10 個月
  },
  multi: {
    id: 'self-multi',
    layout: 'multi',
    name: '自架版（多頁）',
    listMonthly: null,  // 待定
    monthly: null,      // 待定：定案前不可出現在任何頁面
    yearPaidMonths: 10
  }
};

// 相容舊的呼叫方式：PLAN 一律是一頁版
export const PLAN = PLANS.single;

export function planFor(layout) {
  return layout === 'multi' ? PLANS.multi : PLANS.single;
}

// 這個方案的價格是否已經定案、可以顯示
export function hasPrice(plan) {
  return !!plan && typeof plan.monthly === 'number' && plan.monthly > 0;
}

export const money = (n) => 'NT$' + Number(n).toLocaleString('en-US');

// 價格劃掉的樣式（紅色斜線）
export const STRIKE_STYLE = 'text-decoration:none;display:inline-block;padding:0 .25em;color:#9a8f80;' +
  'background:linear-gradient(to top right,transparent calc(50% - 1.5px),#e5484d calc(50% - 1.5px),#e5484d calc(50% + 1.5px),transparent calc(50% + 1.5px))';

// 依租用月數算應付金額：每滿 12 個月付 10 個月，其餘月份按月計算。
// layout 省略時是一頁版；方案價格未定案時回傳 null。
export function quote(months, layout) {
  const P = planFor(layout);
  if (!hasPrice(P)) return null;
  const n = Math.floor(Number(months));
  if (!Number.isFinite(n) || n < 1) return null;
  const years = Math.floor(n / 12);
  const paidMonths = years * P.yearPaidMonths + (n % 12);
  return { months: n, paidMonths, amount: paidMonths * P.monthly, freeMonths: n - paidMonths };
}

export const YEAR_AMOUNT = quote(12).amount;   // 一頁版 5,990
