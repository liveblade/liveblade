# LiveBlade

> Server‑driven reactivity for Laravel Blade — no Livewire, Vue or Inertia required.

LiveBlade enables **dynamic tables, filters, pagination, sorting and auto‑updating KPIs** using only:
- Laravel Blade views (`view()->render()`)
- Lightweight vanilla JavaScript (`~9 KB`)
- Simple HTML attributes (`data-lb=*`)

It mimics the power of Livewire/HTMX but keeps the workflow **100% Blade-first**, zero build pipeline, zero framework lock‑in.

Perfect for:
- Admin dashboards
- Table-heavy applications
- Projects migrating from jQuery
- Teams that prefer Blade over SPA frameworks

---

## ✨ Features

| Feature | Status |
|--------|:------:|
| AJAX HTML Tables | ✅ |
| Pagination Hijacking | ✅ |
| Sorting (server‑side) | ✅ |
| Debounced Search | ✅ |
| Filter controls | ✅ |
| Toggle Actions (POST switches) | ✅ |
| KPI auto polling | ✅ |
| Skeleton loading state | ✅ |
| Browser back/forward support | ✅ |
| Zero dependencies | 🚀 |

No client state — everything comes from the Laravel backend.

---

## 📦 Installation

Include LiveBlade wherever you load Blade templates:

```html
<script src="/js/liveblade.js"></script>
<link rel="stylesheet" href="/css/liveblade.css">


## 🔧 Example Usage (Laravel + Blade)

Below is a full example using Laravel and LiveBlade.

### Controller

```php
// TaskController.php
public function index(Request $request)
{
    if ($request->ajax()) {
        $tasks = Task::query()
            ->when($request->filled('search'), fn ($q) =>
                $q->where('subject', 'like', '%' . $request->search . '%'))
            ->orderBy($request->get('sort', 'id'), $request->get('dir', 'desc'))
            ->paginate(10);

        return response()->json([
            'html' => view('tasks._table', compact('tasks'))->render(),
            'has_more' => $tasks->hasMorePages(),
        ]);
    }

    return view('tasks.index');
}
