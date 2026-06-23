import { expect, test } from "@playwright/test";
import { generateTestWithGraph } from "../agent/qaGraph";

test("LangGraph QA generation module loads without node/channel conflicts", () => {
  expect(typeof generateTestWithGraph).toBe("function");
});
