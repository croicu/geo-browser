import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { getLogger, setLogger } from "./services"
import { ConsoleTelemetrySink, DefaultLogger } from "./logging";

setLogger(new DefaultLogger(new ConsoleTelemetrySink()));
getLogger().info("geo-browser starting");


const map = L.map("map").setView([40.8518, 14.2681], 13);

L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", 
  { attribution: "&copy; OpenStreetMap contributors", }
).addTo(map);