/* YC AXIOM 會員系統設定：這裡只能放 Project URL 與 anon／publishable key（本來就是公開的）。
   service role key、Resend 金鑰等祕密絕對不可放在這個檔案或 repo 內。 */
window.YC_CONFIG = {
  supabaseUrl: '',        // 例如 https://xxxxxxxx.supabase.co
  supabaseAnonKey: '',    // anon／publishable key
  features: {
    magicLink: false      // Email 魔法連結：買網域、設定好寄信驗證後再改成 true
  }
};
