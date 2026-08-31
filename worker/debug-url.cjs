require("tsx/cjs");
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const clientId = process.env.FACEBOOK_APP_ID;
const redirectUri = "https://openreply-zeta-ruby.vercel.app/api/instagram/callback";

// Construct the URL the same way the app does
const params = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  scope: "pages_show_list Instagram basic Instagram manage comments Instagram manage messages",
  response_type: "code",
  state: "test-state",
});

const fbUrl = `https://www.facebook.com/dialog/oauth?${params.toString()}`;
console.log("Facebook Login URL:");
console.log(fbUrl);
console.log("\n---");
console.log("Scope param:", params.get("scope"));
console.log("Encoded full URL:", fbUrl);

// Also try the Instagram version
const igParams = new URLSearchParams({
  client_id: process.env.INSTAGRAM_APP_ID,
  redirect_uri: redirectUri,
  scope: "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_manage_insights",
  response_type: "code",
  state: "test-state",
});

const igUrl = `https://www.instagram.com/oauth/authorize?${igParams.toString()}`;
console.log("\nInstagram Business Login URL:");
console.log(igUrl);