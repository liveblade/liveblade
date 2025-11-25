# LiveBlade

**Server-driven reactivity for Laravel Blade. No page reloads. No React. No Vue. Just works.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/github/v/tag/liveblade/liveblade?label=version)](https://github.com/liveblade/liveblade)
[![Size](https://img.shields.io/badge/size-5KB-green.svg)](https://github.com/liveblade/liveblade)

---

## Why LiveBlade?

Every Laravel developer has felt this pain:

> "I just want this table to filter without reloading the page. Do I really need to learn React for this?"

**LiveBlade is the answer.** Add two `<script>` tags and use `data-` attributes. That's it.

```blade
<!-- Add to your layout -->
<script src="https://cdn.jsdelivr.net/gh/liveblade/liveblade@1/dist/liveblade.min.js"></script>
<link  href="https://cdn.jsdelivr.net/gh/liveblade/liveblade@1/dist/liveblade.min.css" rel="stylesheet">


<!-- Use in your views to load a partial view  -->
<div data-lb="/tasks"></div>

```

**No installation. No packages. No webpack. Just works.**

---

## Features

- 🪶 **5KB** - Smaller than a favicon
- 🚀 **Zero dependencies** - Pure vanilla JavaScript
- 🎯 **Laravel-first** - Built for Blade conventions
- 📦 **No build step** - Include and go
- 🔄 **Progressive enhancement** - Works without JavaScript
- 🎭 **Browser history** - Back button just works
- ⚡ **Auto-refresh** - Built-in polling
- 🔒 **Production-ready** - Rate limiting, CSRF, race conditions handled

---

## Quick Start

### 1. Add to Your Layout

```blade
<!DOCTYPE html>
<html>
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/liveblade/liveblade@1/dist/liveblade.min.css">
</head>
<body>
    @yield('content')

    <script src="https://cdn.jsdelivr.net/gh/liveblade/liveblade@1/dist/liveblade.min.js"></script>
</body>
</html>

```

### 2. Create Your View

```blade
@extends("layouts.app")
@section("content")

<!-- Search input  example -->
<input data-lb-search name="search" data-lb-target="#taskList">

<!-- Filter tabs example -->
<a data-lb-nav href="/tasks?status=open" data-lb-target="#taskList">Open</a>
<a data-lb-nav href="/tasks?status=completed" data-lb-target="#taskList">Completed</a>

<!-- Dynamic table example -->
<div id="taskList" data-lb="/tasks"></div>
@endsection
```

### 3. Create Your Partial View

```blade
<table class="table">
    <thead>
        <tr class="bg-gray-50">
            <th><input type="checkbox" class="selected" name="select-all" value="1"></th>
            <th class="pointer" data-lb-sort="id">ID</th>
            <th class="pointer" data-lb-sort="subject">Name</th>
            <th class="pointer" data-lb-sort="status">Status</th>
            <th class="pointer" data-lb-sort="due_date">Due Date</th>
            <th class="pointer" data-lb-sort="priority">Priority</th>
            <th>Completion</th>
        </tr>
    </thead>
    <tbody>
        @forelse($tasks as $task)
            <tr id="taskRow_{{ $task->id }}">
                <td><input type="checkbox" class="selected" name="completed" value="1"></td>
                <td>{{ $task->id }}</td>
                <td>{{ $task->subject }}</td>
                <td>{{ ucfirst($task->status) }}</td>
                <td>{{ $task->due_date }}</td>
                <td>{{ ucfirst($task->priority) }}</td>
                <td>
                    <div class="custom-control custom-switch">
                        <input {{ $task->completion == 100 ? "checked" : "" }} 
                               class="custom-control-input" 
                               data-lb="toggle-update"
                               data-lb-fetch="{{ url("test/tasks/{$task->uuid}/completion") }}" 
                               data-lb-method="POST" 
                               data-lb-target="#tasksTable"
                               id="completion_{{ $task->id }}" 
                               name="completion" 
                               type="checkbox">
                        <label class="custom-control-label" for="completion_{{ $task->id }}">
                            Completed
                        </label>
                    </div>
                </td>
            </tr>
        @empty
            <tr>
                <td class="text-muted py-3 text-center" colspan="8">No tasks found.</td>
            </tr>
        @endforelse
    </tbody>
</table>

@if ($tasks->hasPages())
<div class="row">
    <div class="col-md-6">
        Showing {{ $tasks->firstItem() }}-{{ $tasks->lastItem() }} of {{ $tasks->total() }} tasks
    </div>
    <div class="col-md-6 d-flex justify-content-end">
        <div data-lb="pagination" data-lb-target="#tasksTable">
            {{ $tasks->withQueryString()->links() }}
        </div>
    </div>
</div> 

{{-- Load More Button
<div class="row">
    <div class="col-md-12">
        <button class="btn btn-primary" data-lb="button" data-lb-action="load-more" data-lb-target="#tasksTable">More…</button>
    </div>
</div>
--}}
@endif
```

### 4. Update Your Controller

```php
public function index(Request $request)
{
    $tasks = Task::when($request->search, fn($q, $s) => 
        $q->where('name', 'like', "%{$s}%")
    )->paginate(20);

    if ($request->ajax()) {
        return response()->json([
            'html' => view('tasks.partials.table')->with('tasks', $tasks )->render(),
            'has_more' => $tasks->hasMorePages(),
            'meta' => [
                'total' => $tasks->total(),
                'current_page' => $tasks->currentPage(),
                'per_page' => $tasks->perPage(),
            ]            
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0');
    }

    return view('tasks.index', compact('tasks'));
}
```

**That's it!** You now have live search, AJAX filtering, and pagination without page reloads.

---

## Components

LiveBlade provides 13 components via `data-lb` attributes:

### 1. HTML Container

Loads content dynamically.

```blade
<!-- Long form -->
<div data-lb="html" data-lb-fetch="/tasks"></div>

<!-- Shorthand -->
<div data-lb="/tasks"></div>

<!-- With auto-refresh every 60 seconds -->
<div data-lb="/tasks" data-lb-interval="60"></div>
```

### 2. Search

Debounced text search (300ms default).

```blade
<!-- Long form -->
<input data-lb="search" name="search" data-lb-target="#taskList">

<!-- Shorthand -->
<input data-lb-search name="q" data-lb-target="#taskList">
```

### 3. Navigation/Tabs

Filter links and tab navigation.

```blade
<!-- Long form -->
<a data-lb="nav" data-lb-fetch="/tasks?status=open" data-lb-target="#taskList">Open</a>

<!-- Shorthand -->
<a data-lb-nav href="/tasks?status=open" data-lb-target="#taskList">Open</a>
```

**Features:**
- Auto-manages `active` class
- Updates browser history
- Back button works

### 4. Sortable Columns

Click table headers to sort.

```blade
<th data-lb-sort="name">Name</th>
<th data-lb-sort="created_at">Created</th>
```

**Laravel controller:**

```php
$tasks = Task::when($request->sort, fn($q, $s) => 
    $q->orderBy($s, $request->dir ?? 'asc')
)->paginate(20);
```

### 5. Select Filter

Dropdown filters.

```blade
<!-- Long form -->
<select data-lb="select" data-lb-target="#taskList" name="priority">
    <option value="">All</option>
    <option value="high">High</option>
    <option value="low">Low</option>
</select>

<!-- Shorthand -->
<select data-lb-select data-lb-target="#taskList" name="priority">
    <!-- options -->
</select>
```

### 6. Date Filter

Date picker filters.

```blade
<!-- Long form -->
<input type="date" data-lb="date" data-lb-target="#taskList" name="due_date">

<!-- Shorthand -->
<input type="date" data-lb-date data-lb-target="#taskList" name="due_date">
```

### 7. Pagination

AJAX pagination with Laravel's `links()`.

```blade
<!-- Long form -->
@if ($tasks->hasPages())
<div class="row">
    <div class="col-md-6">
        Showing {{ $tasks->firstItem() }}-{{ $tasks->lastItem() }} of {{ $tasks->total() }} tasks
    </div>
    <div class="col-md-6 d-flex justify-content-end">
        <div data-lb="pagination" data-lb-target="#tasksTable">
            {{ $tasks->withQueryString()->links() }}
        </div>
    </div>
</div> 
@endif

<!-- Shorthand -->
<div data-lb-pagination data-lb-target="#taskList">
    {{ $tasks->withQueryString()->links() }}
</div>

<!-- Load More Button-->
<button class="btn btn-primary" data-lb="button" data-lb-action="load-more" data-lb-target="#tasksTable">More…</button>

```

**Important:** Always use `withQueryString()` to preserve filters!

### 8. Checkbox Toggle

POST requests on checkbox change.

```blade
<!-- Long form -->
<input type="checkbox" 
       data-lb="toggle-update"
       data-lb-fetch="/tasks/{{ $task->id }}/complete"
       data-lb-target="#taskList"
       data-lb-method="POST"
       name="completed"
       {{ $task->completed ? 'checked' : '' }}>

<!-- Shorthand -->
<input type="checkbox" 
       data-lb-toggle-update
       data-lb-fetch="/tasks/{{ $task->id }}/complete"
       data-lb-target="#taskList"
       name="completed">
```

**Laravel route:**

```php
Route::post('/tasks/{task}/complete', function(Request $request, Task $task) {
    $task->update(['completed' => $request->boolean('completed')]);
    return response()->json(['success' => true]);
});
```

**Features:**
- Optimistic UI updates
- Reverts on error
- Visual feedback (updating/success/error states)

### 9. KPI Counters

Auto-updating numbers.

```blade
<!-- Long form -->
<h1 data-lb="data" 
    data-lb-fetch="/tasks/count/open"
    data-lb-interval="60">0</h1>

<!-- Shorthand -->
<h1 data-lb-data 
    data-lb-fetch="/tasks/count/open"
    data-lb-interval="60">0</h1>
```

**Laravel route:**

```php
Route::get('/tasks/count/{status}', function($status) {
    return Task::where('status', $status)->count();
    // Or: return response()->json(['value' => $count]);
});
```

### 10. Buttons

Action buttons (refresh, load more, custom fetch).

```blade
<!-- Refresh button -->
<button data-lb-button data-lb-action="refresh" data-lb-target="#taskList">
    Refresh
</button>

<!-- Load more button -->
<button data-lb-button data-lb-action="load-more" data-lb-target="#taskList">
    Load More
</button>

<!-- Custom fetch -->
<button data-lb-button data-lb-fetch="/tasks?urgent=true" data-lb-target="#taskList">
    Show Urgent
</button>
```

### 11. Form Submission

AJAX form submission with validation.

```blade
<form data-lb-form 
      data-lb-target="#taskList"
      data-lb-success="Task created!"
      action="/tasks" 
      method="POST">
    @csrf
    
    <input name="name" required>
    <textarea name="description"></textarea>
    
    <button type="submit">Create</button>
    
    <!-- Errors show here automatically -->
    <div data-lb-errors></div>
</form>
```

**Laravel controller:**

```php
public function store(Request $request)
{
    $validated = $request->validate([
        'name' => 'required|max:255',
        'description' => 'nullable',
    ]);

    Task::create($validated);

    if ($request->ajax()) {
        return response()->json(['success' => true]);
    }

    return redirect()->route('tasks.index');
}
```

**Features:**
- Shows validation errors inline
- Shows success message
- Refreshes target on success
- Resets form
- Supports file uploads

### 12. Confirmation Dialogs

"Are you sure?" before actions.

```blade
<input type="checkbox" 
       data-lb-checkbox
       data-lb-fetch="/tasks/{{ $task->id }}/delete"
       data-lb-confirm="Delete this task?"
       name="deleted">
```

### 13. Modal Integration

Close modal after form submission.

```blade
<form data-lb-form 
      data-lb-target="#taskList"
      data-lb-close="#createModal"
      action="/tasks" 
      method="POST">
    @csrf
    <!-- form fields -->
</form>
```

---

## Complete Example

### View (tasks/index.blade.php)

```blade
@extends('layouts.app')

@section('content')
<div class="container">

    <!-- KPIs — Fixed interval -->
    <div class="row my-3">
        <div class="col-md-4 text-center">
            <div class="card"><div class="card-body">
                <h1 data-lb-data data-lb-fetch="/tasks/counts?status=not-started" data-lb-interval="100">0</h1>
            </div></div>
        </div>
        <div class="col-md-4 text-center">
            <div class="card"><div class="card-body">
                <h1 data-lb-data data-lb-fetch="/tasks/counts?status=in-progress" data-lb-interval="100">0</h1>
            </div></div>
        </div>
        <div class="col-md-4 text-center">
            <div class="card"><div class="card-body">
                <h1 data-lb-data data-lb-fetch="/tasks/counts?status=completed" data-lb-interval="100">0</h1>
            </div></div>
        </div>
    </div>
    <hr>

    <!-- QUICK FILTERS — Using magical shorthand -->
    <div class="card"><div class="card-body p-1">
        <div class="row">
            <div class="col-6">
                <div class="custom-search-wrapper">
                    <i class="fas fa-search"></i>
                    <input class="form-control form-control-sm" 
                           data-lb-search 
                           data-lb="/tasks" 
                           data-lb-target="#tasksTable"
                           name="search" 
                           placeholder="Search tasks">
                </div>
            </div>
            <div class="col-2">
                <input class="form-control form-control-sm" 
                       data-lb-date 
                       data-lb="/tasks" 
                       data-lb-target="#tasksTable"
                       name="due_date" 
                       type="date">
            </div>
            <div class="col-2">
                <select class="form-control form-control-sm" 
                        data-lb-select 
                        data-lb="/tasks" 
                        data-lb-target="#tasksTable"
                        name="status">
                    <option value="">All Status</option>
                    <option value="not-started">Not Started</option>
                    <option value="in-progress">In Progress</option>
                    <option value="waiting">Waiting</option>
                    <option value="completed">Completed</option>
                </select>
            </div>
            <div class="col-2">
                <select class="form-control form-control-sm" 
                        data-lb-select 
                        data-lb="/tasks" 
                        data-lb-target="#tasksTable"
                        name="priority">
                    <option value="">All Priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                </select>
            </div>
        </div>
    </div></div>

    <!-- NAVIGATION TABS — Magical + active class handled automatically -->
    <ul class="nav nav-tabs modern-tabs mb-3">
        @foreach ([
            "all" => "All",
            "not-started" => "New",
            "in-progress" => "In Progress",
            "completed" => "Completed",
        ] as $val => $label)
            <li class="nav-item">
                <a class="nav-link {{ request()->get('status') == $val || ($val=='all' && !request()->get('status')) ? 'active' : '' }}"
                   data-lb-nav 
                   data-lb="/tasks?status={{ $val == 'all' ? '' : $val }}"
                   data-lb-target="#tasksTable">
                    {{ $label }}
                </a>
            </li>
        @endforeach
    </ul>

    <!-- MAIN TABLE — Fixed interval + magical shorthand -->
    <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
            <h5>Tasks</h5>
            <button class="btn btn-sm btn-outline-secondary" 
                    data-lb-button 
                    data-lb="/tasks" 
                    data-lb-target="#tasksTable">
                Refresh
            </button>
        </div>

        <div class="card-body p-0">
            
            <div class=""
                data-lb="/tasks?status=completed" 
                 data-lb-interval="190"   <!-- ← 190 seconds -->
                 id="tasksTable"></div>

        </div>
    </div>
</div>
@endsection
```

### Partial View (tasks/partials.table.blade.php)

```blade

<table class="table-sm table-striped table-borderless dt w-100 d-block d-md-table table-responsive table py-1">
    <thead>
        <tr class="bg-light">
            <th><input type="checkbox" class="selected" name="select-all" value="1"></th>
            <th class="pointer" data-lb-sort="id">ID</th>
            <th class="pointer" data-lb-sort="subject">Name</th>
            <th class="pointer" data-lb-sort="status">Status</th>
            <th class="pointer" data-lb-sort="due_date">Due Date</th>
            <th class="pointer" data-lb-sort="priority">Priority</th>
            <th>Completion</th>
            <th class="pointer" data-lb-sort="owner">Owner</th>
            <th></th>
        </tr>
    </thead>
    <tbody>
        @forelse($tasks as $task)
            <tr id="taskRow_{{ $task->id }}">
                <td><input type="checkbox" class="selected" name="completed" value="1"></td>
                <td>{{ $task->id }}</td>
                <td>{{ $task->subject }}</td>
                <td>{{ ucfirst($task->status) }}</td>
                <td>{{ $task->due_date }}</td>
                <td>{{ ucfirst($task->priority) }}</td>
                <td>
                    <div class="custom-control custom-switch">
                        <input {{ $task->completion == 100 ? "checked" : "" }} 
                               class="custom-control-input" 
                               data-lb="toggle-update"
                               data-lb-fetch="{{ url("tasks/{$task->uuid}/completion") }}" 
                               data-lb-method="POST" 
                               data-lb-target="#tasksTable"
                               id="completion_{{ $task->id }}" 
                               name="completion" 
                               type="checkbox">
                        <label class="custom-control-label" for="completion_{{ $task->id }}">
                            Completed
                        </label>
                    </div>
                </td>
                <td>{{ $task->owner ?? "N/A" }}</td>
                <td class="d-flex justify-content-end">
                    <div class="dropdown float-right">
                        <a class="dropdown-toggle arrow-none card-drop" data-toggle="dropdown" href="#">
                            <i class="fas fa-ellipsis-h"></i>
                        </a>
                        <div class="dropdown-menu dropdown-menu-right">
                            <a class="dropdown-item"  href="{{ url("tasks/{$task->uuid}") }}">Edit</a>
                            <div class="dropdown-divider"></div>
                            <a class="dropdown-item delete-id text-danger" data-target="#delete-task-modal" data-toggle="modal" href="#">Delete</a>
                        </div>
                    </div>
                </td>
            </tr>
        @empty
            <tr>
                <td class="text-muted py-3 text-center" colspan="8">No tasks found.</td>
            </tr>
        @endforelse
    </tbody>
</table>

@if ($tasks->hasPages())
<div class="row mx-2 mt-2">
    <div class="col-md-6">
        Showing {{ $tasks->firstItem() }}-{{ $tasks->lastItem() }} of {{ $tasks->total() }} tasks
    </div>
    <div class="col-md-6 d-flex justify-content-end">
        <div data-lb="pagination" data-lb-target="#tasksTable">
            {{ $tasks->withQueryString()->links() }}
        </div>
    </div>
</div> 

{{-- Load More Button
<div class="row mx-2 mt-2">
    <div class="col-md-12">
        <button class="btn btn-primary" data-lb="button" data-lb-action="load-more" data-lb-target="#tasksTable">More…</button>
    </div>
</div>
--}}
@endif
```

### Controller

```php
<?php

namespace App\Http\Controllers;

use App\Models\Task;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function index(Request $request)
    {
        $tasks = Task::query()
            ->when($request->search, fn($q, $s) => 
                $q->where('name', 'like', "%{$s}%"))
            ->when($request->status, fn($q, $s) => 
                $q->where('status', $s))
            ->when($request->due_date, fn($q, $d) => 
                $q->whereDate('due_date', $d))
            ->when($request->sort, fn($q, $s) => 
                $q->orderBy($s, $request->dir ?? 'asc'))
            ->when($request->view === 'my-tasks', fn($q) => 
                $q->where('user_id', auth()->id()))
            ->paginate(20);

        if ($request->ajax()) {
            return response()->json([
                // Minify the HTML output to reduce the response size
                // 'html' => $this->minify(view('tasks.partials.table', compact('tasks'))->render())
                'html' => view('tasks.partials.table', compact('tasks'))->render(), 
                'has_more' => $tasks->hasMorePages(),
                'meta' => [
                    'total' => $tasks->total(),
                    'current_page' => $tasks->currentPage(),
                    'per_page' => $tasks->perPage(),
                ]                
            ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0');
        }

        return view('tasks.index', compact('tasks'));
    }

    public function complete(Request $request, Task $task)
    {
        $task->update(['completed' => $request->boolean('completed')]);
        return response()->json(['success' => true]);
    }


    // Optional minify html response to reudce the partial view size
    private function minify($html)
    {
        if (empty($html)) {
            return '';
        }

        // Remove unnecessary spaces between HTML tags
        $html = preg_replace('/>\s+</', '><', $html);

        // Remove multiple spaces and new lines
        $html = preg_replace('/\s+/', ' ', $html);

        return trim($html);
    }
 

}
```

### Routes

```php
Route::middleware('auth')->group(function () {
    Route::get('/tasks', [TaskController::class, 'index'])->name('tasks.index');
    Route::post('/tasks/{task}/complete', [TaskController::class, 'complete']);
    Route::get('/tasks/count/{status}', [TaskController::class, 'count']);
});
```

---

## Configuration

```javascript
// Add after loading LiveBlade
LiveBlade.configure({
    debounce: 400,           // Search delay (ms)
    updateUrl: false,        // Clean URLs (no visible params)
    preserveScroll: true,    // Maintain scroll position
    preserveInputs: true,    // Preserve input values
    smartUpdate: true,       // Skip identical updates
});
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `debounce` | `300` | Search input delay (ms) |
| `requestTimeout` | `30000` | Request timeout (ms) |
| `maxRetries` | `3` | Auto-retry attempts |
| `retryDelay` | `2000` | Delay between retries (ms) |
| `updateUrl` | `true` | Update browser URL with params |
| `updateUrlMode` | `'push'` | History mode: `'push'` or `'replace'` |
| `preserveScroll` | `true` | Maintain scroll position |
| `preserveInputs` | `true` | Preserve input values |
| `smartUpdate` | `true` | Skip unchanged content |

### Clean URLs

Don't want to see `?status=completed&page=2` in the address bar?

```javascript
LiveBlade.configure({
    updateUrl: false  // URL stays clean!
});
```

---

## Security Features

✅ **CSRF Protection** - Automatic token handling  
✅ **Rate Limiting** - 100 requests/minute per endpoint  
✅ **Request Timeout** - 30 second default  
✅ **Race Condition Guard** - Ignores stale responses  
✅ **XSS Protection** - HTML sanitization  
✅ **Auto-retry** - 3 retries with backoff  

---

## Browser Support

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Mobile browsers

**Required APIs:** `fetch`, `AbortController`, `URLSearchParams`, `WeakMap`

---

## Debug Mode

```javascript
// Enable debug logging
LiveBlade.debug(true);

// Test specific element
LiveBlade.test('#taskList');

// Manual refresh
LiveBlade.refresh('#taskList');
```

---

## Events

Listen to LiveBlade events:

```javascript
document.getElementById('taskList').addEventListener('lb:loaded', function(e) {
    console.log('Loaded:', e.detail.url);
    console.log('Data:', e.detail.data);
});

document.getElementById('taskList').addEventListener('lb:error', function(e) {
    console.error('Error:', e.detail.error);
});
```

**Available events:**
- `lb:loaded` - After content loads
- `lb:error` - On error
- `lb:form-success` - After form submission
- `lb:form-error` - On form error
- `lb:checkbox-success` - After checkbox toggle
- `lb:checkbox-error` - On checkbox error

---

## Comparison

| Feature | LiveBlade | Livewire | HTMX | Alpine AJAX | React/Vue |
|---------|-----------|----------|------|-------------|-----------|
| Size | 0.2 kB | 60KB | 13KB | 3KB | 40KB+ |
| Dependencies | 0 | 0 | 0 | Alpine.js | Many |
| Laravel-First | ✅ | ✅ | ❌ | ❌ | ❌ |
| No Backend Changes | ✅ | ❌ | ✅ | ✅ | ❌ |
| Learning Curve | Very Low | Medium | Low | Low | High |
| Progressive Enhancement | ✅ | ❌ | ✅ | ✅ | ❌ |
| Installation | CDN | Composer | CDN | NPM | NPM |

---

## FAQ

### How is this different from Livewire?

Livewire uses a component-based architecture. LiveBlade works with standard Laravel controllers and Blade partials—no new concepts to learn.

### How is this different from HTMX?

HTMX is framework-agnostic. LiveBlade is Laravel-specific with conventions that match Laravel patterns (pagination, CSRF, validation).

### Does it work with Alpine.js?

Yes! Use Alpine.js for client-side interactions alongside LiveBlade for server interactions.

### Can I use this in production?

Yes! The library is production-ready with security features, error handling, and performance optimizations.

---

## Performance

- **Initial load:** ~1ms
- **Update time:** ~9ms (includes smart features)
- **Network overhead:** Minimal (only sends required data)
- **Memory:** ~100KB (including all controllers)

---

## License

MIT License - use freely in personal and commercial projects.

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## Support

- **GitHub Issues:** [Report bugs](https://github.com/liveblade/liveblade/issues)
- **Discussions:** [Ask questions](https://github.com/liveblade/liveblade/discussions)


---

## Credits

Built with ❤️ for the Laravel community.

Inspired by:
- [Laravel Livewire](https://livewire.laravel.com)
- [HTMX](https://htmx.org)
- [Alpine AJAX](https://alpine-ajax.js.org)

---

**⭐ Star this repo if you find it useful!**