import {RestClientV5} from "bybit-api";
import chalk from "chalk";
import moment from "moment";
import momentDurationFormatSetup from 'moment-duration-format';

momentDurationFormatSetup(moment);

// Auth
const apiKey = process.env.BYBIT_API_KEY ?? "key";
const apiSecret = process.env.BYBIT_API_SECRET ?? "secret";

// Params
const symbol = "XRPUSDT";
const quantity = "1";
// only for Unified Trading Account, except used quoteCoin
// const marketUnit = "baseCoin";
const startTradingTime = "02.04.2024 07:59:55";
const pingIntervalInSeconds = 60;
const maxRetryCount = 50;

const client = new RestClientV5({
    key: apiKey,
    secret: apiSecret,
    testnet: false,
    parseAPIRateLimits: true,
    recv_window: 5000,
  },
);

function startCountdown(secondsBeforeListingTime, serverTime) {
  return setInterval(() => {
    const seconds = secondsBeforeListingTime - (moment().unix() - serverTime);

    const duration = moment.duration(seconds, "seconds")
      .format("h [hours], m [minutes], s [seconds]");

    process.stdout.clearLine(-1);
    process.stdout.cursorTo(0);
    process.stdout.write(`Trading will start in ${duration}.`);
  }, 1000);
}

async function getServerTime() {
  let error = null;
  try {
    const res = await client.getServerTime();
    if (res.retMsg === "OK") {
      return res.result.timeSecond;
    }

    error = res.retMsg;
  } catch (e) {
    error = e.message;
  }

  console.error(chalk.red(`Failed to ping server [error=${error}]`));

  return null;
}

async function submitOrder() {
  let error = null;

  try {
    const res = await client.submitOrder({
      category: "spot",
      side: "Buy",
      orderType: "Market",
      symbol: symbol,
      qty: quantity,
      // marketUnit: marketUnit,
    });

    // console.log(res);

    if (res.retMsg === "OK") {
      return {
        orderId: res.result?.orderId ?? "unknownId",
      };
    }

    error = res.retMsg;
  } catch (e) {
    error = e.message;
  }

  return {error};
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


// Initialization

const parsedTradingTime = moment.utc(startTradingTime, "DD.MM.YYYY HH:mm:ss");

console.info(chalk.bold.yellow("Trading bot\n"));
console.info(chalk.bold(`Symbol: ${symbol}`));
console.info(chalk.bold(`Quantity: ${quantity}`));
console.info(chalk.bold(`Start trading time: ${parsedTradingTime.format("DD.MM.YYYY HH:mm:ss z")}\n`));

console.info(chalk.blue(`press Ctrl+C to stop script execution.\n`));


// Waiting before start trading

let countdownIntervalId;
do {
  process.stdout.clearLine(-1);
  process.stdout.cursorTo(0);
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
  }

  const serverTime = await getServerTime();
  if (serverTime) {
    const secondsBeforeStartTrading = parsedTradingTime.unix() - serverTime;
    if (secondsBeforeStartTrading <= 0) {
      break;
    }

    countdownIntervalId = startCountdown(secondsBeforeStartTrading, serverTime);

    await delay(Math.min(pingIntervalInSeconds, secondsBeforeStartTrading) * 1000);
  } else {
    await delay(5000);
  }
} while (true);


// Start trading

console.info(chalk.yellow.bold("\nStart trading\n"));

let retryCount = 0;
while (retryCount < maxRetryCount) {
  const result = await submitOrder();
  if (result.orderId) {
    console.info(chalk.green(`Submit order completed [orderId=${result.orderId}].`));

    break;
  }

  retryCount += 1;
  console.info(chalk.red(`Failed to submit order, making another attempt [error=${result.error}].`));

  await delay(100);
}

// Stop trading

console.info("\nBot was stopped.\n");
