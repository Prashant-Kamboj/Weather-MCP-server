import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const NSW_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";
// create server instance
const server = new McpServer({
    name: "weather",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
    },
});
// helper function for making National weather service API requests
async function makeNWSRequest(url) {
    const headers = {
        "User-Agent": USER_AGENT,
        Accept: "application/geo+json",
    };
    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return (await response.json());
    }
    catch (error) {
        console.error("Error making nation weather service api request", error);
        return null;
    }
}
//format alert data
function formatAlert(feature) {
    const props = feature.properties;
    return [
        `Event: ${props.event || "Unknown"}`,
        `Area: ${props.areaDesc || "Unknown"}`,
        `Severity: ${props.severity || "Unknown"}`,
        `Status: ${props.status || "Unknown"}`,
        `Headline: ${props.headline || "No headline"}`,
    ].join("\n"); //join by new line
}
// register weather tools
// get-alerts tool
server.tool("get-alerts", // tool name
"Get weather alerts for a state", {
    state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"), // paramSchema
}, 
// this function runs when this tool is called with zod parsed value
async ({ state }) => {
    const stateCode = state.toUpperCase();
    const alertsUrl = `${NSW_API_BASE}/alerts?area=${stateCode}`;
    const alertData = await makeNWSRequest(alertsUrl);
    // no alert
    if (!alertData) {
        return {
            content: [
                {
                    type: "text",
                    text: "Failed to retrieve alerts data",
                },
            ],
        };
    }
    const features = alertData.features || [];
    if (features.length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: `No active alerts for ${stateCode}`,
                },
            ],
        };
    }
    const formattedAlert = features.map(formatAlert);
    const alertText = `Active alerts for ${stateCode}"\n\n${formattedAlert.join("\n")}`;
    return {
        content: [
            {
                type: "text",
                text: alertText,
            },
        ],
    };
});
// get-forecast tool
server.tool("get-forecast", // tool name
"Get weather forecast for a location", 
// paramSchema
{
    latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
    longitude: z
        .number()
        .min(-180)
        .max(180)
        .describe("Longitude of the location"),
}, async ({ latitude, longitude }) => {
    // get grid point data
    const pointUrl = `${NSW_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const pointData = await makeNWSRequest(pointUrl);
    if (!pointData) {
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
                },
            ],
        };
    }
    const forecastUrl = pointData.properties?.forecast;
    if (!forecastUrl) {
        return {
            content: [
                {
                    type: "text",
                    text: "Failed to get forecast URL from grid point data",
                },
            ],
        };
    }
    // get forecast Data
    const forecastData = await makeNWSRequest(forecastUrl);
    if (!forecastData) {
        return {
            content: [
                {
                    type: "text",
                    text: "Failed to retrive forecast data",
                },
            ],
        };
    }
    const periods = forecastData.properties?.periods || [];
    if (periods.length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: "No forecast periods available",
                },
            ],
        };
    }
    // format forecast period
    const formattedForecast = periods.map((period) => [
        `${period.name || "Unknown"}:`,
        `Temperature: ${period.temperature || "Unknown"}°${period.temperatureUnit || "F"}`,
        `Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}`,
        `${period.shortForecast || "No forecast available"}`,
        "---",
    ].join("\n"));
    const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join("\n")}`;
    return {
        content: [
            {
                type: "text",
                text: forecastText,
            },
        ],
    };
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Weather MCP server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
