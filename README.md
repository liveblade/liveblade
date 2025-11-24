# LiveBlade – The Complete Guide
> Server-driven reactivity for Laravel Blade — **no Livewire, no Vue, no Inertia, no Alpine needed**.

LiveBlade lets you build highly interactive pages (tables with search, sorting, filters, pagination, toggles, live KPIs, etc.) using **only Laravel Blade + a tiny (~9 KB) vanilla JS file**.

Everything stays **100% backend-driven**.  
Your Laravel controller is still the single source of truth.  
No duplicated state on the frontend.  
No build step. No node_modules hell.

Perfect for:
- Admin panels
- CRUD interfaces
- Internal tools
- Teams that love Blade and hate JavaScript frameworks

---

## Core Philosophy

| Traditional Laravel | Livewire / Inertia | LiveBlade |
|---------------------|---------------------|-----------|
| Full page reload on every action | Component state in JS | **Only the part that changes is re-rendered via AJAX** |
| Simple but slow | Powerful but complex | **Simple AND fast** |

LiveBlade is basically “Turbo/Hotwire for Laravel Blade” but even lighter.

---

## How It Actually Works (Step-by-Step)

1. You mark a `<div>` as a LiveBlade container with `data-lb="html"` and give it a URL (`data-lb-fetch="..."`).
2. On page load the JS fetches that URL **via AJAX** (expects JSON with rendered HTML).
3. Laravel detects the AJAX request (`$request->ajax()` or `X-Requested-With` header), queries the DB, renders a **Blade partial**, returns it.
4. LiveBlade replaces the container’s HTML with the new partial.
5. Any interactive elements inside (search box, sort headers, pagination, etc.) are automatically re-bound because we call `LiveBlade.bind()` again on the new HTML.
6. URL is updated with `history.pushState()` → back/forward buttons work perfectly.
7. Repeat forever → instant, snappy UI with zero JS framework.

---

## Full Feature List (v1.0.0)

| Feature                        | Status | How to use                              |
|--------------------------------|--------|-----------------------------------------|
  AJAX partial updates          | Done   | `data-lb="html"` + `data-lb-fetch`      |
  Laravel pagination hijacking   | Done   | Put pagination inside `[data-lb="pagination"]` |
  Column sorting                 | Done   | `data-lb-sort="column_name"` on `<th>`  |
  Debounced search               | Done   | `<input data-lb="search" name="search">` |
  Select / date filters          | Done   | `data-lb="select"` or `data-lb="date"`  |
  Toggle switches (POST)         | Done   | `data-lb="checkbox" data-lb-fetch="/url"` |
  Live KPI / counters (polling)  | Done   | `data-lb="data" data-lb-fetch="/count" data-lb-interval="15"` |
  Load-more infinite scroll      | Done   | Button with `data-lb-action="load-more"` |
  Skeleton loading screens       | Done   | Automatic when container is empty       |
  Back/forward browser buttons   | Done   | Automatic history handling              |
  Zero dependencies              | Done   | Pure vanilla JS                         |

---

## Installation (3 lines in your layout)

```blade
{{-- Anywhere in <head> or before </body> --}}
<script src="{{ asset('js/liveblade.js') }}"></script>
<link rel="stylesheet" href="{{ asset('css/liveblade.css') }}">

{{-- CSRF token is required for POST toggles --}}
<meta name="csrf-token" content="{{ csrf_token() }}">

```
LiveBlade auto-initializes on page load.
---

## Example Usage

### Controller

```php
public function index(Request $request)
{
    if ($request->ajax()) {

        $tasks = Task::query()
            ->when($request->search, fn($q) =>
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
```

### Main View

```blade
<div id="tasksTable"
     data-lb="html"
     data-lb-fetch="{{ route('tasks.index') }}">
</div>
```

### Partial View

```blade
<table class="table table-bordered">
    <thead>
        <tr>
            <th data-lb-sort="id">#</th>
            <th data-lb-sort="subject">Subject</th>
        </tr>
    </thead>
    <tbody>
        @foreach ($tasks as $task)
            <tr>
                <td>{{ $task->id }}</td>
                <td>{{ $task->subject }}</td>
            </tr>
        @endforeach
    </tbody>
</table>

@if ($tasks->hasPages())
<div data-lb="pagination">
    {!! $tasks->withQueryString()->links() !!}
</div>
@endif
```

---

## UI Controls

Search:

```blade
<input type="text" name="search" data-lb="search">
```

Select filter:

```blade
<select name="status" data-lb="select">
    <option value="">All</option>
    <option value="open">Open</option>
</select>
```

Toggle POST:

```blade
<input type="checkbox"
       data-lb="checkbox"
       data-lb-fetch="/tasks/{{ $task->id }}/toggle"
       data-lb-method="POST">
```

Auto updating KPI:

```blade
<span data-lb="data"
      data-lb-fetch="/api/tasks/count"
      data-lb-interval="15"></span>
```

---

## How it Works (Junior Friendly)

| Action | Who handles it | Result |
|--------|----------------|--------|
| Search/sort/filter | JS | Sends AJAX request |
| Fetch controller | Laravel | Returns HTML + pagination data |
| Insert into DOM | LiveBlade | UI updates instantly |
| URL sync | Browser | Back button works |

Backend remains the single source of truth.

---

## Roadmap

| Feature | Status |
|--------|:------:|
| CDN + NPM release | Soon |
| Form post support | Soon |
| Incremental DOM diffing | Planned |
| Alpine.js helpers | Planned |
| WebSockets | Future |

PRs welcome.

---

## License

MIT License.

---

## Contribute

If you use LiveBlade:
- Star the repo ⭐
- Suggest improvements
- Submit PRs

---

Dynamic UI. 100% Blade. Zero dependencies.
