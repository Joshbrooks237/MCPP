import { runEngine } from "./signalEngine.js";

const data = await runEngine();
console.log(JSON.stringify(data, null, 2));
