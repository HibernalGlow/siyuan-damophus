import { defineCommand, runMain } from "citty";
import { doctorCommand, pasteCommand, statusCommand } from "./commands";

const main = defineCommand({
  meta: {
    name: "damophus",
    version: "0.1.0",
    description: "Damophus command-line tools",
  },
  subCommands: {
    paste: pasteCommand,
    status: statusCommand,
    doctor: doctorCommand,
  },
});

await runMain(main);
