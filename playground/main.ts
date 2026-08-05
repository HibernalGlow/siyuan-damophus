import { mount } from "svelte";
import App from "./App.svelte";
import "./dev.css";

const target = document.querySelector<HTMLElement>("#app");
if (!target) throw new Error("Missing Damophus development root");

mount(App, { target });
