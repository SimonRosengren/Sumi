import { afterEach, describe, expect, it } from "vitest";
import { takeSignInResult } from "@/lib/session";

afterEach(() => history.replaceState(null, "", "/"));

describe("takeSignInResult", () => {
  it("returns nothing for a normal page load", () => {
    expect(takeSignInResult()).toEqual({});
  });

  it("reads the token GitHub sign-in sent and clears it from the address bar", () => {
    history.replaceState(null, "", "/?x=1#token=sumi_abc");
    expect(takeSignInResult()).toEqual({ token: "sumi_abc" });
    expect(location.hash).toBe("");
    expect(location.pathname + location.search).toBe("/?x=1");
  });

  it("reads an error message", () => {
    history.replaceState(null, "", "/#error=Not%20allowed%3A%20x");
    expect(takeSignInResult()).toEqual({ error: "Not allowed: x" });
    expect(location.hash).toBe("");
  });
});
