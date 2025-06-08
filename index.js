const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const nacl = require('tweetnacl');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const chalk = require('chalk');
const moment = require('moment-timezone');
const figlet = require('figlet');
const readline = require('readline');
const fs = require('fs').promises;
const gradient = require('gradient-string');

// Configurations
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:116.0) Gecko/20100101 Firefox/116.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
];
const API_KEY = 'AIzaSyBDdwO2O_Ose7LICa-A78qKJUCEE3nAwsM';
const DOMAIN = 'bitquant.io';
const URI = 'https://bitquant.io';
const VERSION = '1';
const CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const DAILY_CHAT_LIMIT = 20;
const PROXY_TEST_URL = 'http://www.google.com';
const PROXY_TEST_TIMEOUT = 5000;

// UI Gradients
const bannerGradient = gradient('cyan', 'magenta');
const textGradient = gradient('cyan', 'blue');
const successGradient = gradient('green', 'lime');
const errorGradient = gradient('red', 'orange');

function getTimestamp() {
  return moment().tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss');
}

function displayBanner() {
  console.log(bannerGradient('='.repeat(60)));
  console.log(bannerGradient(figlet.textSync('BITBOT', { 
    font: 'ANSI Shadow', 
    horizontalLayout: 'default' 
  })));
  console.log(bannerGradient('='.repeat(60)));
  console.log(successGradient(' '.repeat(15) + '=BITQUANT AUTO BOT='));
  console.log(textGradient(' '.repeat(10) + `Version2.0 Solana Edition Daily Limit: ${DAILY_CHAT_LIMIT} chats`));
  console.log(textGradient(' '.repeat(5) + '=== For More Contact telegram (@allowindo) ==='));
  console.log(bannerGradient('='.repeat(60)));
  console.log('\n');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function promptUser(question) {
  return new Promise((resolve) => {
    rl.question(chalk.white(question), (answer) => {
      resolve(answer.trim());
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function typeText(text, color, noType) {
  const maxLength = 70;
  const displayText = text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  
  if (noType) {
    console.log(color(`[RESPONSE] ${displayText}`));
    return;
  }
  
  process.stdout.write(color('├─ [RESPONSE] '));
  for (const char of displayText) {
    process.stdout.write(char);
    await sleep(100 / displayText.length);
  }
  process.stdout.write('\n');
}

function createProgressBar(current, total) {
  const barLength = 30;
  const filled = Math.round((current / total) * barLength);
  return `[${'█'.repeat(filled)}${' '.repeat(barLength - filled)} ${current}/${total}]`;
}

async function withRetry(fn, maxRetries = 5, actionText = 'Operation') {
  const startTime = Date.now();
  let lastError = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fn();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(successGradient(`├─ ✓ ${actionText} succeeded (${elapsed}s)`));
      return result;
    } catch (err) {
      lastError = err;
      const errorMsg = err.response?.status === 403 ? '403 Forbidden' : 
                     err.response?.data?.error?.message || err.message;
      console.log(errorGradient(`├─ ✗ ${actionText} failed [${i+1}/${maxRetries}]: ${errorMsg}`));
      
      if (i < maxRetries - 1) {
        await sleep(3000);
      }
    }
  }
  throw lastError;
}

function generateMessage(address) {
  const nonce = Date.now();
  const issuedAt = new Date().toISOString();
  return `${DOMAIN} wants you to sign in with your blockchain account:\n${address}\n\nURI: ${URI}\nVersion: ${VERSION}\nChain ID: ${CHAIN_ID}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

function signMessage(message, secretKey) {
  const messageBytes = Buffer.from(message, 'utf8');
  const signature = nacl.sign.detached(messageBytes, secretKey);
  return bs58.encode(signature);
}

function getBaseHeaders(userAgent) {
  return {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'origin': 'https://www.bitquant.io',
    'referer': 'https://www.bitquant.io/',
    'user-agent': userAgent,
  };
}

async function testProxy(proxy) {
  try {
    const agent = new HttpsProxyAgent(proxy);
    const response = await axios.get(PROXY_TEST_URL, {
      httpAgent: agent,
      httpsAgent: agent,
      timeout: PROXY_TEST_TIMEOUT
    });
    return response.status === 200;
  } catch (err) {
    return false;
  }
}

class ProxyManager {
  constructor(proxies) {
    this.proxies = [...proxies];
    this.usedProxies = new Set();
    this.deadProxies = new Set();
  }

  async getAvailableProxy() {
    // Prioritize unused proxies
    for (const proxy of this.proxies) {
      if (!this.usedProxies.has(proxy)) {
        if (await testProxy(proxy)) {
          this.usedProxies.add(proxy);
          return proxy;
        } else {
          this.deadProxies.add(proxy);
        }
      }
    }
    
    // If no unused proxies, try dead proxies (might be revived)
    for (const proxy of this.deadProxies) {
      if (await testProxy(proxy)) {
        this.usedProxies.add(proxy);
        this.deadProxies.delete(proxy);
        return proxy;
      }
    }
    
    return null;
  }

  markProxyDead(proxy) {
    if (proxy && this.usedProxies.has(proxy)) {
      this.usedProxies.delete(proxy);
      this.deadProxies.add(proxy);
    }
  }
}

async function verifySignature(address, message, signature, proxy, baseHeaders) {
  const payload = { address, message, signature };
  const config = { headers: baseHeaders, timeout: 30000 };
  
  if (proxy) {
    const agent = new HttpsProxyAgent(proxy);
    config.httpAgent = agent;
    config.httpsAgent = agent;
  }
  
  const response = await axios.post(
    'https://quant-api.opengradient.ai/api/verify/solana',
    payload,
    config
  );
  return response.data.token;
}

async function getIdToken(token, proxy, baseHeaders) {
  const payload = { token, returnSecureToken: true };
  const config = {
    headers: {
      ...baseHeaders,
      'x-client-data': 'CJz7ygE=',
      'x-client-version': 'Opera/JsCore/11.6.0/FirebaseCore-web',
      'x-firebase-gmpid': '1:976084784386:web:bb57c2b7c2642ce85b1e1b',
    },
    timeout: 30000
  };
  
  if (proxy) {
    const agent = new HttpsProxyAgent(proxy);
    config.httpAgent = agent;
    config.httpsAgent = agent;
  }
  
  const response = await axios.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    payload,
    config
  );
  return {
    idToken: response.data.idToken,
    refreshToken: response.data.refreshToken
  };
}

async function refreshAccessToken(refreshToken, proxy, baseHeaders) {
  const payload = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;
  const config = {
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-client-data': 'CJz7ygE=',
      'x-client-version': 'Opera/JsCore/11.6.0/FirebaseCore-web',
      'x-firebase-gmpid': '1:976084784386:web:bb57c2b7c2642ce85b1e1b',
    },
    timeout: 30000
  };
  
  if (proxy) {
    const agent = new HttpsProxyAgent(proxy);
    config.httpAgent = agent;
    config.httpsAgent = agent;
  }
  
  const response = await axios.post(
    `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`,
    payload,
    config
  );
  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token
  };
}

async function sendChat(accessToken, context, message, proxy, baseHeaders) {
  const payload = {
    context,
    message: { type: 'user', message }
  };
  const config = {
    headers: {
      ...baseHeaders,
      'Authorization': `Bearer ${accessToken}`,
    },
    timeout: 60000
  };
  
  if (proxy) {
    const agent = new HttpsProxyAgent(proxy);
    config.httpAgent = agent;
    config.httpsAgent = agent;
  }
  
  const response = await axios.post(
    'https://quant-api.opengradient.ai/api/agent/run',
    payload,
    config
  );
  return response.data.message;
}

async function getStats(accessToken, address, proxy, baseHeaders) {
  const config = {
    headers: {
      ...baseHeaders,
      'Authorization': `Bearer ${accessToken}`,
    },
    timeout: 30000
  };
  
  if (proxy) {
    const agent = new HttpsProxyAgent(proxy);
    config.httpAgent = agent;
    config.httpsAgent = agent;
  }
  
  const response = await axios.get(
    `https://quant-api.opengradient.ai/api/activity/stats?address=${address}`,
    config
  );
  return response.data;
}

async function authenticate(address, secretKey, proxy, userAgent) {
  const baseHeaders = getBaseHeaders(userAgent);
  return withRetry(async () => {
    const message = generateMessage(address);
    const signature = signMessage(message, secretKey);
    const token = await verifySignature(address, message, signature, proxy, baseHeaders);
    const { idToken, refreshToken } = await getIdToken(token, proxy, baseHeaders);
    return { idToken, refreshToken, baseHeaders };
  }, 5, 'Authentication');
}

async function processAccount(accountIndex, totalAccounts, privateKey, messages, proxyManager, chatCount, noType) {
  let keypair;
  try {
    keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
  } catch (err) {
    console.log(errorGradient(`✗ Invalid private key for account ${accountIndex + 1}`));
    return { success: false };
  }

  const address = keypair.publicKey.toBase58();
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  
  // Get proxy for this account
  let proxy = await proxyManager.getAvailableProxy();
  if (!proxy) {
    console.log(textGradient('├─ No active proxies available, continuing without proxy'));
  }
  
  console.log(bannerGradient(`├── ACCOUNT ${accountIndex + 1}/${totalAccounts} [${shortAddress}] ─── ${getTimestamp()} ──────┤`));
  console.log(textGradient(`├─ Proxy: ${proxy || 'None'}`));
  
  let userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  let sessionState = {
    idToken: null,
    refreshToken: null,
    baseHeaders: null,
    history: [],
    retry403Count: 0,
  };
  
  const max403Retries = 3;
  let consecutive403Failures = 0;
  let processedChats = 0;
  
  async function resetSession() {
    userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const authResult = await authenticate(address, keypair.secretKey, proxy, userAgent);
    sessionState.idToken = authResult.idToken;
    sessionState.refreshToken = authResult.refreshToken;
    sessionState.baseHeaders = authResult.baseHeaders;
    sessionState.history = [];
    sessionState.retry403Count = 0;
  }
  
  try {
    await resetSession();
    console.log(successGradient('├─ CHAT PROCESS STARTED'));
    
    for (let chatIndex = 0; chatIndex < chatCount; chatIndex++) {
      console.log(textGradient(`├─ CHAT ${chatIndex + 1}/${chatCount} ${createProgressBar(chatIndex + 1, chatCount)}`));
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      console.log(chalk.white(`├─ Message: ${chalk.yellow(randomMessage)}`));
      
      // Refresh token
      let accessToken;
      try {
        const refreshResult = await withRetry(
          () => refreshAccessToken(sessionState.refreshToken, proxy, sessionState.baseHeaders),
          3,
          'Token refresh'
        );
        accessToken = refreshResult.accessToken;
        sessionState.refreshToken = refreshResult.refreshToken;
      } catch (err) {
        console.log(errorGradient('├─ Token refresh failed, resetting session'));
        await resetSession();
        accessToken = sessionState.idToken;
      }
      
      // Check stats
      let stats;
      try {
        stats = await withRetry(
          () => getStats(accessToken, address, proxy, sessionState.baseHeaders),
          3,
          'Get stats'
        );
        
        if (stats.daily_message_count >= stats.daily_message_limit) {
          console.log(errorGradient(`├─ Daily limit reached: ${stats.daily_message_count}/${stats.daily_message_limit}`));
          break;
        }
      } catch (err) {
        console.log(errorGradient('├─ Failed to get stats, skipping chat'));
        continue;
      }
      
      // Prepare context
      const context = {
        conversationHistory: sessionState.history,
        address,
        poolPositions: [],
        availablePools: [],
      };
      
      // Send chat
      let chatSuccess = false;
      for (let attempt = 0; attempt <= max403Retries; attempt++) {
        try {
          const response = await withRetry(
            () => sendChat(accessToken, context, randomMessage, proxy, sessionState.baseHeaders),
            3,
            'Send message'
          );
          
          await typeText(response, chalk.magenta, noType);
          sessionState.history.push({ type: 'user', message: randomMessage });
          sessionState.history.push({ type: 'assistant', message: response });
          
          // Update stats
          const updatedStats = await withRetry(
            () => getStats(accessToken, address, proxy, sessionState.baseHeaders),
            3,
            'Update stats'
          );
          
          console.log(textGradient(`├─ Daily: ${updatedStats.daily_message_count}/${updatedStats.daily_message_limit} | Total: ${updatedStats.message_count} | Points: ${updatedStats.points}`));
          chatSuccess = true;
          processedChats++;
          break;
        } catch (err) {
          if (err.response?.status === 403 && attempt < max403Retries) {
            consecutive403Failures++;
            console.log(textGradient(`├─ 403 Error (attempt ${attempt + 1}/${max403Retries}), resetting session`));
            await sleep(5000);
            await resetSession();
            
            if (consecutive403Failures >= 3) {
              console.log(errorGradient('├─ Too many 403 errors, skipping account'));
              break;
            }
          } else {
            // Handle proxy errors
            if (proxy && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED')) {
              console.log(errorGradient(`├─ Proxy error: ${err.message}`));
              proxyManager.markProxyDead(proxy);
              
              // Get new proxy
              const newProxy = await proxyManager.getAvailableProxy();
              if (newProxy) {
                console.log(textGradient(`├─ Switching to new proxy: ${newProxy}`));
                proxy = newProxy;
                await resetSession();
              } else {
                console.log(errorGradient('├─ No active proxies available, continuing without proxy'));
                proxy = null;
                await resetSession();
              }
            } else {
              console.log(errorGradient(`├─ Chat failed: ${err.message}`));
              break;
            }
          }
        }
      }
      
      if (!chatSuccess) {
        console.log(errorGradient('├─ Chat failed after retries'));
      }
      
      await sleep(8000 + Math.floor(Math.random() * 4000));
    }
    
    // Account summary
    console.log(successGradient('├─ ACCOUNT SUMMARY'));
    console.log(textGradient(`├─ Address: ${shortAddress}`));
    console.log(textGradient(`├─ Chats processed: ${processedChats}/${chatCount}`));
    console.log(bannerGradient('├' + '─'.repeat(58) + '┤'));
    return { success: true, processed: processedChats };
  } catch (err) {
    console.log(errorGradient(`├─ Account processing error: ${err.message}`));
    return { success: false };
  }
}

async function processAccounts(privateKeys, messages, proxyManager, chatCount, noType) {
  let successCount = 0;
  let failCount = 0;
  let totalChats = 0;
  
  console.log(bannerGradient('├── STARTING PROCESS ─── ' + getTimestamp() + ' ────────┤'));
  
  for (let i = 0; i < privateKeys.length; i++) {
    const result = await processAccount(
      i,
      privateKeys.length,
      privateKeys[i],
      messages,
      proxyManager,
      chatCount,
      noType
    );
    
    if (result.success) {
      successCount++;
      totalChats += result.processed || 0;
    } else {
      failCount++;
    }
    
    // Add separation between accounts
    if (i < privateKeys.length - 1) {
      console.log('\n' + textGradient('├── NEXT ACCOUNT ─────┤') + '\n');
      await sleep(2000);
    }
  }
  
  console.log(bannerGradient('├── PROCESS COMPLETE ─── ' + getTimestamp() + ' ────────┤'));
  console.log(successGradient(`├─ SUCCESS: ${successCount} accounts`));
  console.log(errorGradient(`├─ FAILED: ${failCount} accounts`));
  console.log(textGradient(`├─ TOTAL CHATS: ${totalChats}`));
  console.log(bannerGradient('├' + '─'.repeat(58) + '┤'));
  
  return { successCount, failCount, totalChats };
}

function startCountdown(nextRunTime) {
  return new Promise(resolve => {
    console.log(textGradient('├─ WAITING FOR NEXT RUN...'));
    
    const countdownInterval = setInterval(() => {
      const now = moment();
      const timeLeft = moment.duration(nextRunTime.diff(now));
      
      if (timeLeft.asSeconds() <= 0) {
        clearInterval(countdownInterval);
        resolve();
        return;
      }
      
      const hours = Math.floor(timeLeft.asHours()).toString().padStart(2, '0');
      const minutes = Math.floor(timeLeft.minutes()).toString().padStart(2, '0');
      const seconds = Math.floor(timeLeft.seconds()).toString().padStart(2, '0');
      
      process.stdout.write(textGradient(`├─ Next run in: ${hours}:${minutes}:${seconds} \r`));
    }, 1000);
  });
}

async function scheduleNextRun(privateKeys, messages, proxyManager, chatCount, noType) {
  while (true) {
    const nextRunTime = moment().add(24, 'hours');
    console.log(successGradient('├─ ALL PROCESSES COMPLETED SUCCESSFULLY'));
    await startCountdown(nextRunTime);
    console.log('\n' + successGradient('├─ STARTING NEW SESSION'));
    await processAccounts(privateKeys, messages, proxyManager, chatCount, noType);
  }
}

async function main() {
  displayBanner();
  const noType = process.argv.includes('--no-type');
  const nonInteractive = process.argv.includes('--non-interactive');
  
  console.log(textGradient('├─ LOADING CONFIGURATION...'));
  
  // Load private keys
  let privateKeys;
  try {
    const data = await fs.readFile('pk.txt', 'utf8');
    privateKeys = data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
      
    if (privateKeys.length === 0) {
      throw new Error('No valid private keys found');
    }
    console.log(successGradient(`├─ Loaded ${privateKeys.length} private keys`));
  } catch (err) {
    console.log(errorGradient('├─ ERROR: Failed to load private keys (pk.txt)'));
    console.log(errorGradient(`├─ Reason: ${err.message}`));
    rl.close();
    return;
  }
  
  // Load messages
  let messages;
  try {
    const data = await fs.readFile('pesan.txt', 'utf8');
    messages = data.split('\n')
      .map(line => line.trim().replace(/\r/g, ''))
      .filter(line => line.length > 0);
      
    if (messages.length === 0) {
      throw new Error('No messages found');
    }
    console.log(successGradient(`├─ Loaded ${messages.length} messages`));
  } catch (err) {
    console.log(errorGradient('├─ ERROR: Failed to load messages (pesan.txt)'));
    console.log(errorGradient(`├─ Reason: ${err.message}`));
    rl.close();
    return;
  }
  
  // Load proxies
  let proxies = [];
  try {
    const data = await fs.readFile('proxy.txt', 'utf8');
    proxies = data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
      
    if (proxies.length > 0) {
      console.log(successGradient(`├─ Loaded ${proxies.length} proxies`));
      
      // Test all proxies
      console.log(textGradient('├─ Testing proxies...'));
      const testResults = await Promise.all(proxies.map(testProxy));
      const activeProxies = proxies.filter((_, i) => testResults[i]);
      console.log(successGradient(`├─ Active proxies: ${activeProxies.length}/${proxies.length}`));
      proxies = activeProxies;
    } else {
      console.log(textGradient('├─ No proxies found, continuing without'));
    }
  } catch (err) {
    console.log(textGradient('├─ Proxy file not found, continuing without proxies'));
  }
  
  const proxyManager = new ProxyManager(proxies);
  
  let chatCount;
  if (nonInteractive) {
    console.log(successGradient('├─ NON-INTERACTIVE MODE'));
    chatCount = parseInt(process.env.CHAT_COUNT) || 1;
    if (chatCount > DAILY_CHAT_LIMIT) {
      console.log(errorGradient(`├─ WARNING: Exceeds daily limit (${DAILY_CHAT_LIMIT}), adjusting`));
      chatCount = DAILY_CHAT_LIMIT;
    }
  } else {
    while (true) {
      try {
        const input = await promptUser(textGradient('├─ Enter chats per account: '));
        chatCount = parseInt(input, 10);
        
        if (isNaN(chatCount)) {
          throw new Error('Invalid number');
        }
        if (chatCount < 1) {
          throw new Error('Must be at least 1');
        }
        if (chatCount > DAILY_CHAT_LIMIT) {
          console.log(errorGradient(`├─ WARNING: Exceeds daily limit (${DAILY_CHAT_LIMIT}), adjusting`));
          chatCount = DAILY_CHAT_LIMIT;
        }
        break;
      } catch (err) {
        console.log(errorGradient(`├─ ERROR: ${err.message}`));
      }
    }
  }
  
  console.log(bannerGradient('├── CONFIGURATION SUMMARY ───────────┤'));
  console.log(textGradient(`├─ Accounts: ${privateKeys.length}`));
  console.log(textGradient(`├─ Chats/account: ${chatCount}`));
  console.log(textGradient(`├─ Total chats: ${privateKeys.length * chatCount}`));
  console.log(textGradient(`├─ Proxies: ${proxies.length > 0 ? 'Yes' : 'No'}`));
  console.log(textGradient(`├─ Typing effect: ${noType ? 'Disabled' : 'Enabled'}`));
  console.log(bannerGradient('├' + '─'.repeat(58) + '┤'));
  
  await processAccounts(privateKeys, messages, proxyManager, chatCount, noType);
  await scheduleNextRun(privateKeys, messages, proxyManager, chatCount, noType);
  
  rl.close();
}

main().catch(err => {
  console.error(errorGradient('├─ FATAL ERROR:'), err);
  process.exit(1);
});