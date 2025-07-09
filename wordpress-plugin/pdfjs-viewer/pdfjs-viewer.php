<?php
/*
Plugin Name: PDF.js Viewer Plus
Description: Embed PDFs using Mozilla PDF.js with annotation, highlighting, translation and text-to-speech.
Version: 0.1.0
Author: PDF.js Plugin
*/

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly.
}

class PDFJS_Viewer_Plus {
    const OPTION_TRANSLATE_KEY = 'pdfjs_translate_key';
    const OPTION_TTS_KEY = 'pdfjs_tts_key';

    public function __construct() {
        add_shortcode('pdfjs-viewer', array($this, 'shortcode'));
        add_action('admin_menu', array($this, 'settings_page'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
    }

    public function enqueue_scripts() {
        wp_register_script('pdfjs', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.1.392/pdf.min.js', array(), null);
        wp_register_script('pdfjs-viewer-plus', plugins_url('js/pdfjs-viewer.js', __FILE__), array('pdfjs'), '0.1.0', true);
        wp_register_style('pdfjs-viewer-plus', plugins_url('css/pdfjs-viewer.css', __FILE__), array(), '0.1.0');
    }

    public function register_settings() {
        register_setting('pdfjs_viewer_plus', self::OPTION_TRANSLATE_KEY);
        register_setting('pdfjs_viewer_plus', self::OPTION_TTS_KEY);
    }

    public function settings_page() {
        add_options_page('PDF.js Viewer Plus', 'PDF.js Viewer Plus', 'manage_options', 'pdfjs-viewer-plus', array($this, 'render_settings_page'));
    }

    public function render_settings_page() {
        ?>
        <div class="wrap">
            <h1>PDF.js Viewer Plus</h1>
            <form method="post" action="options.php">
                <?php settings_fields('pdfjs_viewer_plus'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="<?php echo self::OPTION_TRANSLATE_KEY; ?>">Google Translate API key</label></th>
                        <td><input name="<?php echo self::OPTION_TRANSLATE_KEY; ?>" type="text" id="<?php echo self::OPTION_TRANSLATE_KEY; ?>" value="<?php echo esc_attr(get_option(self::OPTION_TRANSLATE_KEY)); ?>" class="regular-text" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="<?php echo self::OPTION_TTS_KEY; ?>">Google Text-to-Speech API key</label></th>
                        <td><input name="<?php echo self::OPTION_TTS_KEY; ?>" type="text" id="<?php echo self::OPTION_TTS_KEY; ?>" value="<?php echo esc_attr(get_option(self::OPTION_TTS_KEY)); ?>" class="regular-text" /></td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    public function shortcode($atts) {
        $atts = shortcode_atts(array(
            'url' => '',
            'download' => 'true',
            'fullscreen' => 'true',
            'annotation' => 'true',
            'highlight' => 'true',
            'translate' => 'false',
            'tts' => 'false'
        ), $atts, 'pdfjs-viewer');

        if (empty($atts['url'])) {
            return '<p>No PDF URL provided.</p>';
        }

        wp_enqueue_script('pdfjs');
        wp_enqueue_script('pdfjs-viewer-plus');
        wp_enqueue_style('pdfjs-viewer-plus');

        $options = array(
            'download' => filter_var($atts['download'], FILTER_VALIDATE_BOOLEAN),
            'fullscreen' => filter_var($atts['fullscreen'], FILTER_VALIDATE_BOOLEAN),
            'annotation' => filter_var($atts['annotation'], FILTER_VALIDATE_BOOLEAN),
            'highlight' => filter_var($atts['highlight'], FILTER_VALIDATE_BOOLEAN),
            'translate' => filter_var($atts['translate'], FILTER_VALIDATE_BOOLEAN),
            'tts' => filter_var($atts['tts'], FILTER_VALIDATE_BOOLEAN),
            'translateKey' => get_option(self::OPTION_TRANSLATE_KEY),
            'ttsKey' => get_option(self::OPTION_TTS_KEY)
        );

        $div_id = 'pdfjs_' . uniqid();
        $json_options = wp_json_encode($options);

        ob_start();
        ?>
        <div id="<?php echo $div_id; ?>" class="pdfjs-viewer" data-url="<?php echo esc_attr($atts['url']); ?>" data-options='<?php echo esc_attr($json_options); ?>'></div>
        <?php
        return ob_get_clean();
    }
}

new PDFJS_Viewer_Plus();
?>
