require("tsx/cjs");
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const fbUrl = new URL("https://www.facebook.com/dialog/oauth");
fbUrl.searchParams.set("client_id", process.env.FACEBOOK_APP_ID);
fbUrl.searchParams.set("redirect_uri", "https://openreply-zeta-ruby.vercel.app/api/instagram/callback");
fbUrl.searchParams.set("scope", "pages_show_list instagram_business_basic instagram_business_manage_messages instagram_business_manage_comments instagram_business_manage_insights");
fbUrl.searchParams.set("response_type", "code");
fbUrl.searchParams.set("state", "test-123");

console.log(fbUrl.toString());

// Also try the simplified version
const fbUrl2 = new URL("https://www.facebook.com/dialog/oauth");
fbUrl2.searchParams.set("client_id", process.env.FACEBOOK_APP_ID);
fbUrl2.searchParams.set("redirect_uri", "https://openreply-zeta-ruby.vercel.app/api/instagram/callback");
// Just one scope to isolate
fbUrl2.searchParams.set("scope", "pages_show_list");
fbUrl2.searchParams.set("response_type", "code");
fbUrl2.searchParams.set("state", "test-456");

console.log("\n---\n");
console.log(fbUrl2.toString());