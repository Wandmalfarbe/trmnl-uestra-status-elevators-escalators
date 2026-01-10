import {JSDOM} from "jsdom";
import fs from "node:fs";
import path from "node:path";
import {fromZonedTime} from "date-fns-tz";

const updateTrmnlp = process.argv.includes("--update-trmnlp");

const url = "https://aufzuege.uestra.de/ApplianceStatus?mode=3";
const outputDir = "public";
const outputFile = path.join(outputDir, "result.json");
const trmnlpYamlFile = path.join("../.trmnlp.yml");

async function run() {
    const res = await fetch(url);
    const html = await res.text();

    const dom = new JSDOM(html);
    const {document} = dom.window;

    const stations = document.querySelectorAll(".panel.allstations");
    const lastUpdateTime = getLastUpdateTime(document);
    const circulationElements = [];

    stations.forEach(station => {
        const stationName = station
            .querySelector(".panel-title")
            .textContent
            .trim();

        const lines = station.querySelectorAll(".lines:not(.emptylines)");

        lines.forEach(line => {
            const id = line.getAttribute("id");
            const title = line
                .querySelector(".panel-heading img")
                ?.getAttribute("alt") ?? "";

            const isOutOfOrder = line.classList.contains("danger");
            const isElevator = title.includes("Aufzug");
            const isEscalator = title.includes("Rolltreppe");

            const linesList = [
                ...line.querySelectorAll(".linesList li.passed strong")
            ].map(elem => elem.textContent.trim());

            circulationElements.push({
                id,
                stationName,
                title,
                isOutOfOrder,
                isElevator,
                isEscalator,
                linesList
            });
        });
    });

    const output = {
        source: url,
        scrapeTime: new Date().toISOString(),
        lastUpdateTime: lastUpdateTime.toISOString(),
        circulationElements: circulationElements
    }

    fs.mkdirSync(outputDir, {recursive: true});
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf-8");

    if (updateTrmnlp) {
        const minifiedJson = JSON.stringify(output);
        if (fs.existsSync(trmnlpYamlFile)) {
            let yamlContent = fs.readFileSync(trmnlpYamlFile, "utf-8");
            yamlContent = yamlContent.replace(/(  json: ).*/s, "$1" + minifiedJson);
            fs.writeFileSync(trmnlpYamlFile, yamlContent, "utf-8");
            console.log(`Updated ${trmnlpYamlFile} with minified JSON.`);
        } else {
            console.warn(`${trmnlpYamlFile} does not exist, skipping update.`);
        }
    }
}

function getLastUpdateTime(document) {
    const lastUpdateTimeString = document.querySelector("p.timestamp")
        .textContent.trim()
        .replace(/Letzte Änderung: /, "");
    const match = lastUpdateTimeString.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);

    if (match) {
        const [, day, month, year, hour, minute, second] = match;
        const lastUpdateLocalDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
        return fromZonedTime(lastUpdateLocalDate, "Europe/Berlin");
    } else {
        throw new Error("Could not read last update time");
    }
}

run().catch(console.error);
