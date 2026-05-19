/**
 * Loads ~/.pi/mypi.json env into process.env on extension load (non-empty, unset keys only).
 * Child shells inherit via getShellEnv().
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyConfigEnv } from "../../shared/mypi-config/merge-env.js";

applyConfigEnv();

export default function (_pi: ExtensionAPI) {}
