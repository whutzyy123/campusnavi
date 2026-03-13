/**
 * 数据埋点封装层
 * 遵循 docs/数据埋点说明文档.md 规范
 * 平台无关设计，可对接 GA4、Mixpanel、自建等
 */

export type TrackPropertyValue = string | number | boolean | null | undefined;

export interface TrackEvent {
  name: string;
  properties?: Record<string, TrackPropertyValue>;
}

/** 通用上下文（由封装层自动注入） */
interface TrackContext {
  timestamp: number;
  session_id?: string;
  user_id_hash?: string;
  school_id?: string | null;
  page_path?: string;
  platform: "web" | "wap";
  app_version: string;
}

const APP_VERSION = process.env.npm_package_version ?? "0.1.0";

/** 生成或获取会话 ID */
function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = sessionStorage.getItem("analytics_session_id");
  if (!sid) {
    sid = `s_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    sessionStorage.setItem("analytics_session_id", sid);
  }
  return sid;
}

/** 简单哈希（用于 user_id 脱敏，非加密用途） */
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  return Math.abs(h).toString(36);
}

/** 构建通用上下文 */
function buildContext(extra?: Record<string, TrackPropertyValue>): TrackContext & Record<string, TrackPropertyValue> {
  const ctx: TrackContext & Record<string, TrackPropertyValue> = {
    timestamp: Date.now(),
    session_id: typeof window !== "undefined" ? getSessionId() : undefined,
    page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
    platform: typeof navigator !== "undefined" && /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "wap" : "web",
    app_version: APP_VERSION,
  };
  return { ...ctx, ...extra };
}

/** 是否启用埋点 */
function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const env = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED;
  return env === "true" || env === "1";
}

/** 发送到 GA4（若配置） */
function sendToGA4(event: TrackEvent, context: Record<string, TrackPropertyValue>): void {
  const gid = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!gid || typeof window === "undefined" || !(window as unknown as { gtag?: (...args: unknown[]) => void }).gtag) return;
  const gtag = (window as unknown as { gtag: (...args: unknown[]) => void }).gtag;
  gtag("event", event.name, { ...event.properties, ...context });
}

/** 发送到 Mixpanel（若配置） */
function sendToMixpanel(event: TrackEvent, context: Record<string, TrackPropertyValue>): void {
  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  if (!token || typeof window === "undefined") return;
  const mixpanel = (window as unknown as { mixpanel?: { track: (name: string, props?: Record<string, unknown>) => void } }).mixpanel;
  if (mixpanel?.track) {
    mixpanel.track(event.name, { ...event.properties, ...context } as Record<string, unknown>);
  }
}

/** 开发环境控制台输出 */
function logInDev(event: TrackEvent, context: Record<string, TrackPropertyValue>): void {
  if (process.env.NODE_ENV === "development" && typeof console !== "undefined" && console.debug) {
    console.debug("[Analytics]", event.name, { ...event.properties, ...context });
  }
}

/**
 * 统一埋点上报
 * @param event 事件名与属性
 * @param options 可选：user_id（用于生成 user_id_hash）、school_id
 */
export function track(
  event: TrackEvent,
  options?: { userId?: string; schoolId?: string | null }
): void {
  const extra: Record<string, TrackPropertyValue> = {};
  if (options?.userId) {
    extra.user_id_hash = simpleHash(options.userId);
  }
  if (options?.schoolId !== undefined) {
    extra.school_id = options.schoolId ?? null;
  }
  const context = buildContext(extra);

  // 开发环境始终输出
  logInDev(event, context);

  if (!isEnabled()) return;

  const payload = { ...event.properties, ...context };

  sendToGA4(event, payload);
  sendToMixpanel(event, payload);

  // 自建 API 上报（若配置）
  const apiUrl = process.env.NEXT_PUBLIC_ANALYTICS_API_URL;
  if (apiUrl && typeof fetch !== "undefined") {
    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: event.name, properties: payload }),
      keepalive: true,
    }).catch(() => {});
  }
}

// ========== 类型安全的便捷方法 ==========

export const analytics = {
  pageView: (props: { page_path: string; page_title: string; school_id?: string | null; referrer?: string; user_role?: string }) =>
    track({ name: "page_view", properties: props }),

  auth: {
    loginClick: (props?: { page_path?: string }) => track({ name: "auth_login_click", properties: props ?? {} }),
    loginSuccess: (props?: { user_role?: string; school_id?: string }) => track({ name: "auth_login_success", properties: props ?? {} }),
    loginFail: (props?: { error_reason?: string }) => track({ name: "auth_login_fail", properties: props ?? {} }),
    registerStart: () => track({ name: "auth_register_start" }),
    registerSubmit: (props?: { has_invitation_code?: boolean }) => track({ name: "auth_register_submit", properties: props ?? {} }),
    registerSuccess: (props?: { user_role?: string }) => track({ name: "auth_register_success", properties: props ?? {} }),
    registerFail: (props?: { error_reason?: string }) => track({ name: "auth_register_fail", properties: props ?? {} }),
    logoutClick: () => track({ name: "auth_logout_click" }),
  },

  map: {
    schoolSelect: (props: { school_id: string; school_code: string; from_detect?: boolean }) =>
      track({ name: "map_school_select", properties: props }),
    schoolDetectSuccess: (props: { school_id: string }) => track({ name: "map_school_detect_success", properties: props }),
    schoolDetectFail: () => track({ name: "map_school_detect_fail" }),
    filterToggle: (props: { category_ids: string; action: string }) => track({ name: "map_filter_toggle", properties: props }),
    zoomChange: (props: { zoom_level: number }) => track({ name: "map_zoom_change", properties: props }),
    centerChange: (props?: { lat?: number; lng?: number }) => track({ name: "map_center_change", properties: props ?? {} }),
    markerClusterClick: (props: { cluster_count: number; zoom_level?: number }) =>
      track({ name: "map_marker_cluster_click", properties: props }),
    markerClick: (props: { poi_id: string; poi_name?: string; is_sub_poi?: boolean }) =>
      track({ name: "map_marker_click", properties: props }),
  },

  poi: {
    drawerOpen: (props: { poi_id: string; poi_name?: string; source?: string }) =>
      track({ name: "poi_drawer_open", properties: props }),
    drawerClose: (props: { poi_id: string; duration_ms?: number }) => track({ name: "poi_drawer_close", properties: props }),
    searchSubmit: (props: { query: string; result_count?: number }) => track({ name: "poi_search_submit", properties: props }),
    searchClick: (props: { poi_id: string; rank?: number }) => track({ name: "poi_search_click", properties: props }),
    statusReportSubmit: (props: { poi_id: string; status_type: string }) =>
      track({ name: "poi_status_report_submit", properties: props }),
    statusReportSuccess: (props: { poi_id: string }) => track({ name: "poi_status_report_success", properties: props }),
    showInMapClick: (props: { poi_id: string; is_sub_poi?: boolean }) =>
      track({ name: "poi_show_in_map_click", properties: props }),
    navigateClick: (props: { poi_id: string }) => track({ name: "poi_navigate_click", properties: props }),
  },

  nav: {
    startSet: (props: { source: string; poi_id?: string }) => track({ name: "nav_start_set", properties: props }),
    endSet: (props: { source: string; poi_id?: string }) => track({ name: "nav_end_set", properties: props }),
    modeSwitch: (props: { from: "walk" | "ride"; to: "walk" | "ride" }) =>
      track({ name: "nav_mode_switch", properties: props }),
    routePlanSuccess: (props: { distance_m: number; duration_s: number; nav_mode?: "walk" | "ride" }) =>
      track({ name: "nav_route_plan_success", properties: props }),
    routePlanFail: (props?: { error_reason?: string; nav_mode?: "walk" | "ride" }) =>
      track({ name: "nav_route_plan_fail", properties: props ?? {} }),
    panelClose: (props?: { duration_ms?: number }) => track({ name: "nav_panel_close", properties: props ?? {} }),
  },

  comment: {
    submit: (props: { poi_id: string; has_parent_id?: boolean }) => track({ name: "comment_submit", properties: props }),
    submitSuccess: (props: { poi_id: string }) => track({ name: "comment_submit_success", properties: props }),
    submitFail: (props: { poi_id: string; error_reason?: string }) => track({ name: "comment_submit_fail", properties: props }),
    likeClick: (props: { comment_id: string; action?: string }) => track({ name: "comment_like_click", properties: props }),
    replyClick: (props: { comment_id: string }) => track({ name: "comment_reply_click", properties: props }),
    reportClick: (props: { comment_id: string }) => track({ name: "comment_report_click", properties: props }),
    contactReveal: (props: { entity_type: string; entity_id: string }) =>
      track({ name: "comment_contact_reveal", properties: props }),
  },

  lostFound: {
    createClick: (props: { poi_id: string }) => track({ name: "lost_found_create_click", properties: props }),
    createSubmit: (props: { poi_id: string; image_count?: number }) => track({ name: "lost_found_create_submit", properties: props }),
    createSuccess: (props: { event_id: string }) => track({ name: "lost_found_create_success", properties: props }),
    detailOpen: (props: { event_id: string }) => track({ name: "lost_found_detail_open", properties: props }),
    markFoundClick: (props: { event_id: string }) => track({ name: "lost_found_mark_found_click", properties: props }),
  },

  market: {
    itemListView: (props?: { type_id?: string; category_id?: string }) =>
      track({ name: "market_item_list_view", properties: props ?? {} }),
    itemDetailOpen: (props: { item_id: string; type_id?: string }) =>
      track({ name: "market_item_detail_open", properties: props }),
    itemDetailClose: (props: { item_id: string; duration_ms?: number }) =>
      track({ name: "market_item_detail_close", properties: props }),
    itemPostClick: () => track({ name: "market_item_post_click" }),
    itemPostSubmit: (props: { type_id: string; poi_id: string; category_id?: string }) =>
      track({ name: "market_item_post_submit", properties: props }),
    itemPostSuccess: (props: { item_id: string }) => track({ name: "market_item_post_success", properties: props }),
    intentionSubmit: (props: { item_id: string }) => track({ name: "market_intention_submit", properties: props }),
    intentionSubmitSuccess: (props: { item_id: string }) => track({ name: "market_intention_submit_success", properties: props }),
    buyerSelect: (props: { item_id: string }) => track({ name: "market_buyer_select", properties: props }),
    itemLock: (props: { item_id: string }) => track({ name: "market_item_lock", properties: props }),
    confirmClick: (props: { item_id: string; role?: string }) => track({ name: "market_confirm_click", properties: props }),
    confirmSuccess: (props: { item_id: string }) => track({ name: "market_confirm_success", properties: props }),
    rateSubmit: (props: { item_id: string; is_positive?: boolean }) => track({ name: "market_rate_submit", properties: props }),
    contactReveal: (props: { item_id: string }) => track({ name: "market_contact_reveal", properties: props }),
    reportClick: (props: { item_id: string }) => track({ name: "market_report_click", properties: props }),
    showInMapClick: (props: { item_id: string; poi_id: string }) =>
      track({ name: "market_show_in_map_click", properties: props }),
  },

  activity: {
    cardClick: (props: { activity_id: string; poi_id: string }) => track({ name: "activity_card_click", properties: props }),
    detailOpen: (props: { activity_id: string }) => track({ name: "activity_detail_open", properties: props }),
    linkClick: (props: { activity_id: string }) => track({ name: "activity_link_click", properties: props }),
  },

  profile: {
    tabSwitch: (props: { tab_name: string }) => track({ name: "profile_tab_switch", properties: props }),
    editClick: (props: { field: string }) => track({ name: "profile_edit_click", properties: props }),
    editSubmit: (props: { field: string }) => track({ name: "profile_edit_submit", properties: props }),
    passwordChangeSubmit: () => track({ name: "profile_password_change_submit" }),
    emailChangeSubmit: () => track({ name: "profile_email_change_submit" }),
    deleteAccountClick: () => track({ name: "profile_delete_account_click" }),
    notificationClick: (props: { notification_type?: string }) =>
      track({ name: "profile_notification_click", properties: props ?? {} }),
    notificationMarkRead: (props?: { count?: number }) =>
      track({ name: "profile_notification_mark_read", properties: props ?? {} }),
  },

  admin: {
    poiCreate: (props: { school_id: string }) => track({ name: "admin_poi_create", properties: props }),
    poiEdit: (props: { poi_id: string }) => track({ name: "admin_poi_edit", properties: props }),
    poiDelete: (props: { poi_id: string }) => track({ name: "admin_poi_delete", properties: props }),
    commentAudit: (props: { action: string; comment_id: string }) =>
      track({ name: "admin_comment_audit", properties: props }),
    marketAudit: (props: { action: string; item_id: string }) => track({ name: "admin_market_audit", properties: props }),
    campusEdit: (props: { campus_id: string }) => track({ name: "admin_campus_edit", properties: props }),
    invitationCreate: (props: { school_id: string; type: string }) =>
      track({ name: "admin_invitation_create", properties: props }),
    invitationToggle: (props: { code_id: string; new_status: string }) =>
      track({ name: "admin_invitation_toggle", properties: props }),
  },

  superAdmin: {
    schoolCreate: () => track({ name: "super_admin_school_create" }),
    schoolEdit: (props: { school_id: string }) => track({ name: "super_admin_school_edit", properties: props }),
    userToggle: (props: { user_id: string; new_status: string }) =>
      track({ name: "super_admin_user_toggle", properties: props }),
    userDelete: (props: { user_id: string }) => track({ name: "super_admin_user_delete", properties: props }),
    keywordAdd: () => track({ name: "super_admin_keyword_add" }),
    categoryEdit: (props: { category_type: string }) => track({ name: "super_admin_category_edit", properties: props }),
    marketConfigEdit: () => track({ name: "super_admin_market_config_edit" }),
  },
} as const;
