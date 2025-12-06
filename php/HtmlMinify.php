<?php

namespace App\Helpers;

/**
 * HtmlMinify Helper
 * 
 * Minifies HTML output to reduce response size for AJAX partials.
 * 
 * Usage in Controller:
 *   use App\Helpers\HtmlMinify;
 *   
 *   $html = HtmlMinify::minify(view('orders.partials.row', compact('order'))->render());
 * 
 * Or as a trait:
 *   use App\Traits\MinifiesHtml;
 *   
 *   class OrderController extends Controller
 *   {
 *       use MinifiesHtml;
 *       
 *       public function store(Request $request)
 *       {
 *           $order = Order::create($request->validated());
 *           $html = $this->minifyHtml(view('orders.partials.row', compact('order'))->render());
 *           
            return response()->json([
                'success' => true,
                'message' => 'Created order',
                'html' => $html,
            ]);
 * 
 *       }
 *   }
 */
class HtmlMinify
{
    /**
     * Minify HTML string
     *
     * @param string $html
     * @param array $options
     * @return string
     */
    public static function minify(string $html, array $options = []): string
    {
        if (empty($html)) {
            return '';
        }

        $defaults = [
            'remove_comments' => true,
            'remove_whitespace' => true,
            'preserve_pre' => true,
            'preserve_textarea' => true,
            'preserve_script' => true,
        ];

        $options = array_merge($defaults, $options);

        // Store preserved content
        $preserved = [];
        $preserveIndex = 0;

        // Preserve <pre> tags
        if ($options['preserve_pre']) {
            $html = preg_replace_callback('/<pre[^>]*>.*?<\/pre>/is', function ($match) use (&$preserved, &$preserveIndex) {
                $key = '<!--PRESERVE:' . $preserveIndex++ . '-->';
                $preserved[$key] = $match[0];
                return $key;
            }, $html);
        }

        // Preserve <textarea> tags
        if ($options['preserve_textarea']) {
            $html = preg_replace_callback('/<textarea[^>]*>.*?<\/textarea>/is', function ($match) use (&$preserved, &$preserveIndex) {
                $key = '<!--PRESERVE:' . $preserveIndex++ . '-->';
                $preserved[$key] = $match[0];
                return $key;
            }, $html);
        }

        // Preserve <script> tags
        if ($options['preserve_script']) {
            $html = preg_replace_callback('/<script[^>]*>.*?<\/script>/is', function ($match) use (&$preserved, &$preserveIndex) {
                $key = '<!--PRESERVE:' . $preserveIndex++ . '-->';
                $preserved[$key] = $match[0];
                return $key;
            }, $html);
        }

        // Preserve inline styles (don't break CSS)
        $html = preg_replace_callback('/<style[^>]*>.*?<\/style>/is', function ($match) use (&$preserved, &$preserveIndex) {
            $key = '<!--PRESERVE:' . $preserveIndex++ . '-->';
            $preserved[$key] = $match[0];
            return $key;
        }, $html);

        // Remove HTML comments (but not preserved placeholders)
        if ($options['remove_comments']) {
            $html = preg_replace('/<!--(?!PRESERVE:)[^>]*-->/s', '', $html);
        }

        // Remove whitespace
        if ($options['remove_whitespace']) {
            // Remove whitespace between tags
            $html = preg_replace('/>\s+</', '><', $html);
            
            // Replace multiple spaces/newlines with single space
            $html = preg_replace('/\s+/', ' ', $html);
        }

        // Restore preserved content
        foreach ($preserved as $key => $content) {
            $html = str_replace($key, $content, $html);
        }

        return trim($html);
    }

    /**
     * Minify and render a view
     *
     * @param string $view
     * @param array $data
     * @param array $options
     * @return string
     */
    public static function view(string $view, array $data = [], array $options = []): string
    {
        $html = view($view, $data)->render();
        return self::minify($html, $options);
    }
}