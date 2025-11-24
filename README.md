# LiveBlade

> Server-driven reactivity for Laravel Blade — no Livewire, Vue or Inertia required.

LiveBlade enables dynamic UI behavior using:
- Laravel Blade partials (`view()->render()`)
- Lightweight vanilla JavaScript (~9 KB)
- Simple HTML attributes (`data-lb="..."`)

No SPA. No state duplication. Always backend-driven.

Great for:
- Admin dashboards
- Data tables
- Teams that prefer Blade-first development

---

## Features

| Feature | Status |
|--------|:------:|
| AJAX Blade partial updates | ✅ |
| Laravel pagination hijack | ✅ |
| Sorting | ✅ |
| Debounced search | ✅ |
| Filters (select/date) | ✅ |
| Toggle via POST | ✅ |
| KPI auto polling | ✅ |
| Skeleton loading UI | ✅ |
| Back/forward button support | ✅ |
| Zero dependencies | 🚀 |

---

## Installation

```blade
<script src="/js/liveblade.js"></script>
<link rel="stylesheet" href="/css/liveblade.css">
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
