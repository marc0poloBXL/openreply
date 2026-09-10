// try_link2.mjs — investigate page IDs and Business Manager
const USER_TOKEN = 'EAAO8NOuhRXQBSSnKot3LTPhFYiT8LSFplNLB1iuJsVwCGbbTHTtRNuTY07JnD5OZBe4CZC9s5ZBmdRjAkOFujk4aceocfPNgYzR3hGnt9ZAjBohpywRxy1HxAQL4oGWwDHbjPGmbIjTI15IhGLTZCAEQIDKd2WA3ARDhoyO5OW9h5CwE2wyuYz3Oy69ViB7ZBmpbAoX03Y8iUU0ZCrEpvhlG67mA6h3vARucnSp5C0NTmMPNirVZBXMFpQaZBXjbUA178VkUnCLdJBR4J6ZASymbZCy';
const PAGE_ID_NEW = '1229304876940609';
const PAGE_ID_OLD = '61594011424463';
const IG_ID = '17841438935909153';

async function call(method, url) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' } });
  return { status: r.status, body: await r.json() };
}

async function main() {
  // Check old page ID
  console.log('=== Old page ID 61594011424463 ===');
  let r = await call('GET', `https://graph.facebook.com/v26.0/${PAGE_ID_OLD}?fields=id,name&access_token=${USER_TOKEN}`);
  console.log(JSON.stringify(r.body, null, 2));

  // Check both pages in /me/accounts to see all fields
  console.log('\n=== /me/accounts with full fields ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${USER_TOKEN}`);
  console.log(JSON.stringify(r.body, null, 2));

  // Check Business Manager owned pages
  console.log('\n=== BM 2052016095704629 owned_pages ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/2052016095704629/owned_pages?fields=id,name&access_token=${USER_TOKEN}`);
  console.log(JSON.stringify(r.body, null, 2));

  // Check BM 5180791675279566 owned_pages
  console.log('\n=== BM 5180791675279566 owned_pages ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/5180791675279566/owned_pages?fields=id,name&access_token=${USER_TOKEN}`);
  console.log(JSON.stringify(r.body, null, 2));

  // What type of page is this?
  console.log('\n=== Page type/creation info ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/${PAGE_ID_NEW}?fields=id,name,about,description,category,is_community_page,is_published,verification_status&access_token=${USER_TOKEN}`);
  console.log(JSON.stringify(r.body, null, 2));

  // Check IG account fields
  console.log('\n=== IG account via graph FB (user token) ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/${IG_ID}?fields=id,username,profile_picture_url,follow_count,is_business,is_verified&access_token=${USER_TOKEN}`);
  console.log(JSON.stringify(r.body, null, 2));

  // Try reading comments with user token (has instagram_manage_comments)
  console.log('\n=== Comments via user token on graph.facebook.com ===');
  // Use one of the media IDs that has 26 comments
  const mediaIds = ['18085664627243598', '18130956592710804', '18075752990344401'];
  for (const mid of mediaIds) {
    r = await call('GET', `https://graph.facebook.com/v26.0/${mid}/comments?fields=id,text,from{id,name},timestamp&access_token=${USER_TOKEN}`);
    if (r.body.data?.length > 0) {
      console.log(`Media ${mid}: ${r.body.data.length} comments found!`);
      console.log(JSON.stringify(r.body.data.slice(0, 2), null, 2));
      break;
    } else {
      console.log(`Media ${mid}: ${r.body.error?.message || '0 comments'}`);
    }
  }

  // Try with app token
  const APP_TOKEN = '1051360407668084|b2708ce0c790783fbf27c0dfcc0e1459';
  console.log('\n=== App subscriptions detailed ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/1051360407668084/subscriptions?access_token=${APP_TOKEN}`);
  console.log(JSON.stringify(r.body, null, 2));

  // Check the IG account's subscribed_apps
  console.log('\n=== IG subscribed_apps via instagram graph ===');
  // We can only check this with IGAA token, skip
  console.log('(needs IGAA token - will check via token-helper approach)');
}

main().catch(e => console.error(e.message));