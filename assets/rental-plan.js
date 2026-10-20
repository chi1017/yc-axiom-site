// 網站租用方案：單一方案（價格的唯一來源）。
// 編輯器、會員專區「我的網站」、後台確認收款都從這裡讀，改價格只要改這個檔案。
// 靜態頁面（/rental/、/pricing/、首頁與常見問題）的價格文字是手寫的，改價格時要一起改。
export const PLAN = {
  id: 'self',
  name: '自架版',
  listMonthly: 690,   // 原價（顯示時以紅色斜線劃掉）
  monthly: 599,       // 目前特價，每月
  yearPaidMonths: 10  // 一次付 12 個月，只收 10 個月
};

export const money = (n) => 'NT$' + Number(n).toLocaleString('en-US');

// 價格劃掉的樣式（紅色斜線）
export const STRIKE_STYLE = 'text-decoration:none;display:inline-block;padding:0 .25em;color:#9a8f80;' +
  'background:linear-gradient(to top right,transparent calc(50% - 1.5px),#e5484d calc(50% - 1.5px),#e5484d calc(50% + 1.5px),transparent calc(50% + 1.5px))';

// 依租用月數算應付金額：每滿 12 個月付 10 個月，其餘月份按月計算
export function quote(months) {
  const n = Math.floor(Number(months));
  if (!Number.isFinite(n) || n < 1) return null;
  const years = Math.floor(n / 12);
  const paidMonths = years * PLAN.yearPaidMonths + (n % 12);
  return { months: n, paidMonths, amount: paidMonths * PLAN.monthly, freeMonths: n - paidMonths };
}

export const YEAR_AMOUNT = quote(12).amount;   // 5,990
