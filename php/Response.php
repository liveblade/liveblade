<?php

namespace App\Traits;

use Illuminate\Http\JsonResponse;

/**
 * LiveBlade Response Trait
 * 
 * Provides helper methods for server-driven LiveBlade responses.
 * 
 * Usage in Controller:
 *   use App\Traits\LiveBladeResponse;
 *   
 *   class OrderController extends Controller
 *   {
 *       use LiveBladeResponse;
 *       
 *       public function store(Request $request)
 *       {
 *           $order = Order::create($request->validated());
 *           $html = view('orders.partials.row', compact('order'))->render();
 *           
 *           return $this->lbPrepend('#orders-list', $html, 'Order created!', '#add-modal');
 *       }
 *   }
 */
trait LiveBladeResponse
{
    /**
     * Prepend HTML to target
     */
    protected function lbPrepend(string $target, string $html, ?string $message = null, ?string $close = null): JsonResponse
    {
        return $this->lbResponse('prepend', $target, $html, $message, $close);
    }

    /**
     * Append HTML to target
     */
    protected function lbAppend(string $target, string $html, ?string $message = null, ?string $close = null): JsonResponse
    {
        return $this->lbResponse('append', $target, $html, $message, $close);
    }

    /**
     * Replace target element with HTML
     */
    protected function lbReplace(string $target, string $html, ?string $message = null, ?int $fade = null): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'html' => $html,
            'action' => array_filter([
                'type' => 'replace',
                'target' => $target,
                'fade' => $fade,
            ])
        ]);
    }

    /**
     * Remove target element
     */
    protected function lbRemove(string $target, ?string $message = null): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'action' => [
                'type' => 'remove',
                'target' => $target,
            ]
        ]);
    }

    /**
     * Refresh target container(s)
     */
    protected function lbRefresh(string $targets, ?string $message = null, ?string $close = null): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'action' => array_filter([
                'type' => 'refresh',
                'target' => $targets,
                'close' => $close,
            ])
        ]);
    }

    /**
     * Redirect to URL
     */
    protected function lbRedirect(string $url, ?string $message = null): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'action' => [
                'type' => 'redirect',
                'redirect' => $url,
            ]
        ]);
    }

    /**
     * Replace multiple elements (bulk update)
     */
    protected function lbReplaceMultiple(array $items, ?string $message = null, ?int $fade = null): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'action' => array_filter([
                'type' => 'replace-multiple',
                'items' => $items,
                'fade' => $fade,
            ])
        ]);
    }

    /**
     * Remove multiple elements (bulk delete)
     */
    protected function lbRemoveMultiple(array $targets, ?string $message = null): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'action' => [
                'type' => 'remove-multiple',
                'targets' => $targets,
            ]
        ]);
    }

    /**
     * Return error response
     */
    protected function lbError(string $message, ?array $errors = null, int $status = 422): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => $message,
            'errors' => $errors,
        ], $status);
    }

    /**
     * Return success response (no DOM changes, just message)
     */
    protected function lbSuccess(?string $message = null, ?string $close = null): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'action' => array_filter([
                'close' => $close,
            ])
        ]);
    }

    /**
     * Build response with action
     */
    private function lbResponse(string $type, string $target, string $html, ?string $message = null, ?string $close = null): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'html' => $html,
            'action' => array_filter([
                'type' => $type,
                'target' => $target,
                'close' => $close,
            ])
        ]);
    }
}