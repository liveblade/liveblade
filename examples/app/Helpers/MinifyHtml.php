<?php

namespace App\Helpers;

class MinifyHtml
{

    public static function minify($html)
    {
        if(empty($html)) {
            return '';
        }
        return preg_replace('/\s+/', ' ', $html); // Remove extra spaces and line breaks
    }

    public static function minifyNew(?string $html): string
    {
        if (!$html) {
            return '';
        }

        // Skip minify in debug mode for easier Blade inspection
        if (config('app.debug')) {
            return $html;
        }

        $placeholders = [];
        $i = 0;

        // Protect script/style/pre/textarea/svg/noscript blocks
        $html = preg_replace_callback(
            '#<(script|style|pre|textarea|svg|noscript)(\b[^>]*)>(.*?)</\1>#si',
            function ($m) use (&$placeholders, &$i) {
                $key = "%%MINIFY_PLACEHOLDER_{$i}%%";
                $placeholders[$key] = $m[0];
                $i++;
                return $key;
            },
            $html
        );

        // Remove HTML comments except IE conditionals
        $html = preg_replace('/<!--(?!\[if)(?!<!)[^\[>].*?-->/s', '', $html);

        // Collapse whitespace between tags but keep a single space
        $html = preg_replace('/>\s+</', '> <', $html);

        // Remove excess whitespace but preserve necessary spaces
        $html = preg_replace('/\s{2,}/', ' ', $html);

        // Remove spaces around tags fully
        $html = preg_replace('/>\s+</', '><', $html);

        // Restore protected blocks cleanly
        foreach ($placeholders as $key => $content) {
            $html = str_replace($key, $content, $html);
        }

        return trim($html);
    }
}
