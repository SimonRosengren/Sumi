import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import SiteLayout from "./SiteLayout.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  Layout: SiteLayout,
} satisfies Theme;
