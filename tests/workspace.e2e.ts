import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
test("desktop merchant workflow, save failure, dirty guard and all groups", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/merchant");
  await expect(
    page.getByRole("heading", { name: "Restaurant library", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add restaurant", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Add restaurant" });
  await modal
    .getByRole("textbox")
    .nth(0)
    .fill("Sample browser acceptance restaurant" + Date.now());
  await modal.getByRole("textbox").nth(1).fill("Austin, TX");
  await modal.getByRole("textbox").nth(2).fill("New American");
  await modal.getByRole("textbox").nth(3).fill("88 Example St (fictional)");
  await modal
    .getByRole("textbox", { name: "City", exact: true })
    .fill("Austin");
  await modal
    .getByRole("combobox", { name: "State / territory", exact: true })
    .selectOption("TX");
  await modal
    .getByRole("textbox", { name: "ZIP Code", exact: true })
    .fill("78701");
  await modal
    .getByRole("combobox", { name: "Restaurant time zone", exact: true })
    .selectOption("America/Chicago");
  await modal
    .getByRole("combobox", { name: "Brand association", exact: true })
    .selectOption("independent");
  await modal.getByRole("button", { name: "Create and open profile" }).click();
  await expect(
    page.getByRole("heading", { name: /Sample browser acceptance restaurant/ }),
  ).toBeVisible();
  await page
    .getByRole("combobox", {
      name: "Restaurant description value status",
      exact: true,
    })
    .selectOption("known");
  await page
    .getByRole("textbox", { name: "Restaurant description", exact: true })
    .fill("Input that must survive a failed save");
  await page.route("**/api/merchant", async (route) => {
    const data = route.request().postDataJSON();
    if (data?.op === "saveGroup")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "STORAGE_ERROR",
            message: "Simulated save failure. Please try again.",
          },
        }),
      });
    await route.continue();
  });
  await page.getByRole("button", { name: "Save section" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Simulated save failure" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Restaurant description", exact: true }),
  ).toHaveValue("Input that must survive a failed save");
  await page.unroute("**/api/merchant");
  await page.getByRole("button", { name: /Location & directions/ }).click();
  await expect(
    page.getByRole("dialog", { name: "This section has unsaved changes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(
    page.getByRole("textbox", { name: "Restaurant description", exact: true }),
  ).toHaveValue("Input that must survive a failed save");
  await page.getByRole("button", { name: "Save section" }).click();
  await expect(page.getByRole("status")).toContainText("Section saved.");
  await page.reload();
  await page.getByRole("button", { name: "View →" }).first().click();
  const contacts = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: "Public contacts", exact: true }),
  });
  await contacts.getByRole("button", { name: "Add", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add Public contacts" });
  await add.getByRole("textbox", { name: "Type", exact: true }).fill("phone");
  await add
    .getByRole("textbox", { name: "Phone, email or account", exact: true })
    .fill("+1-512-555-0100");
  await add.getByRole("button", { name: "Save and add another" }).click();
  await expect(
    page.getByRole("dialog", { name: "Add Public contacts" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Phone, email or account", exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const groups = [
    "Location & directions",
    "Hours & operating status",
    "Menus, food & beverages",
    "Pricing, taxes & payments",
    "Seating & amenities",
    "Service & guest policies",
    "Licenses & recognition",
    "Content & media assets",
    "Listings & channel snapshots",
    "Internal client records",
  ];
  for (const name of groups) {
    await page
      .getByRole("navigation", { name: "Profile sections" })
      .getByRole("button", { name: new RegExp(name) })
      .click();
    await expect(
      page.getByRole("heading", { name: "Basic details", exact: true }),
    ).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(
      /[\u3400-\u9fff]/,
    );
  }
  await page
    .getByRole("navigation", { name: "Profile sections" })
    .getByRole("button", { name: /Identity & brand/ })
    .click();
  await page
    .getByRole("checkbox", { name: "Select Restaurant name", exact: true })
    .check();
  await page.getByRole("button", { name: /Verify selected/ }).click();
  await page
    .getByRole("dialog", { name: "Verify selected facts" })
    .getByRole("textbox", {
      name: "Source & verification notes *",
      exact: true,
    })
    .fill("Sample phone verification");
  await page
    .getByRole("button", { name: "Confirm verification update" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Export public profile", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Export public profile" }),
  ).toContainText("Internal records");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  mkdirSync(".local/qa", { recursive: true });
  await page.screenshot({
    path: ".local/qa/merchant-detail.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to restaurants" }).click();
  await page.screenshot({
    path: ".local/qa/merchant-list.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("local origin restriction and complete backup through HTTP", async ({
  request,
  page,
}) => {
  const denied = await request.post("/api/merchant", {
    headers: { Origin: "https://example.com" },
    data: { op: "createMerchant", args: {} },
  });
  expect(denied.status()).toBe(403);
  await page.goto("/merchant");
  await page
    .getByRole("button", { name: "Backup & restore", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create full backup", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Backup complete.");
  const manual = page
    .getByRole("row")
    .filter({ hasText: "Manual full backup" })
    .first();
  await manual.getByRole("button", { name: "Validate & restore" }).click();
  await expect(
    page.getByRole("dialog", { name: "Confirm full restore" }),
  ).toContainText("Validation passed");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});
