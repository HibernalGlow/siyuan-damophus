import { defineCommand, runMain } from "citty";
import { bridgeCommand, doctorCommand, exportCommand, pasteCommand, skillCommand, statusCommand } from "./commands";

const main = defineCommand({
  meta: {
    name: "damophus",
    version: "0.1.0",
    description: "Damophus command-line tools",
  },
  subCommands: {
    paste: pasteCommand,
    export: exportCommand,
    status: statusCommand,
    doctor: doctorCommand,
    bridge: bridgeCommand,
    skill: skillCommand,
  },
});

await runMain(main);
