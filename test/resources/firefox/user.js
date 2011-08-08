'use strict';

user_pref('browser.console.showInPanel', true);
user_pref('browser.dom.window.dump.enabled', true);
user_pref('browser.firstrun.show.localepicker', false);
user_pref('browser.firstrun.show.uidiscovery', false);
user_pref('dom.allow_scripts_to_close_windows', true);
user_pref('dom.disable_open_during_load', false);
user_pref('dom.max_script_run_time', 0); // no slow script dialogs
user_pref('dom.max_chrome_script_run_time', 0);
user_pref('dom.popup_maximum', -1);
user_pref('dom.send_after_paint_to_content', true);
user_pref('dom.successive_dialog_time_limit', 0);
user_pref('security.warn_submit_insecure', false);
user_pref('browser.shell.checkDefaultBrowser', false);
user_pref('shell.checkDefaultClient', false);
user_pref('browser.warnOnQuit', false);
user_pref('accessibility.typeaheadfind.autostart', false);
user_pref('javascript.options.showInConsole', true);
user_pref('devtools.errorconsole.enabled', true);
user_pref('layout.debug.enable_data_xbl', true);
user_pref('browser.EULA.override', true);
user_pref('javascript.options.tracejit.content', true);
user_pref('javascript.options.methodjit.content', true);
user_pref('javascript.options.jitprofiling.content', true);
user_pref('javascript.options.methodjit_always', false);
user_pref('gfx.color_management.force_srgb', true);
user_pref('network.manage-offline-status', false);
user_pref('test.mousescroll', true);
user_pref('network.http.prompt-temp-redirect', false);
user_pref('media.cache_size', 100);
user_pref('security.warn_viewing_mixed', false);
user_pref('app.update.enabled', false);
user_pref('browser.panorama.experienced_first_run', true); // Assume experienced
user_pref('dom.w3c_touch_events.enabled', true);
user_pref('extensions.checkCompatibility', false);
user_pref('extensions.installDistroAddons', false); // prevent testpilot etc
user_pref('browser.safebrowsing.enable', false); // prevent traffic to google servers
user_pref('toolkit.telemetry.prompted', true); // prevent telemetry banner
user_pref('toolkit.telemetry.enabled', false);
