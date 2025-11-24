@extends('layouts.app')
@section('content')

<!-- KPIs autload and auto update -->
<div class="row">
    <div class="col-md-4">
        <div class="card">
            <div class="card-body">
                <h1 data-lb-fetch="/tasks/counts?status=not-started" data-lb-interval="100s" data-lb="data" id="taskOpenCount">0</h1>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card">
            <div class="card-body">
                <h1 data-lb-fetch="/tasks/counts?status=in-progress" data-lb-interval="100s" data-lb="data" id="taskInProgressCount">0</h1>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card">
            <div class="card-body">
                <h1 data-lb-fetch="/tasks/counts?status=completed" data-lb-interval="100s" data-lb="data" id="taskCompletedCount">0</h1>
            </div>
        </div>
    </div>
</div>


<div class="container">

    <!-- STATUS FILTER -->
    <div class="row mb-3">
        <div class="col-md-4">
            <div class="modern-tabs-container mb-2">
                <ul class="nav nav-tabs modern-tabs">
                        <li class="nav-item">
                            <a class="nav-link {{ request()->get("status") === "all" ? "active" : "" }}" data-lb-fetch="/tasks?status=all" data-lb-target="#tasksTable" data-lb="nav" href="#">All</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link {{ request()->get("status") === "not-started" ? "active" : "" }}" data-lb-fetch="/tasks?status=not-started" data-lb-target="#tasksTable" data-lb="nav" href="#">New</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link {{ request()->get("status") === "in-progress" ? "active" : "" }}" data-lb-fetch="/tasks?status=in-progress" data-lb-target="#tasksTable" data-lb="nav" href="#">In Progress</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link {{ request()->get("status") === "completed" ? "active" : "" }}" data-lb-fetch="/tasks?status=completed" data-lb-target="#tasksTable" data-lb="nav" href="#">Completed</a>
                        </li>

                </ul>
            </div>
        </div>
    </div>

    <!-- TASKS LISTING -->
    <div class="card">
        <div class="card-header">
            <div class="row g-2">
                <div class="col-md-4">
                    <h5>Tasks</h5>
                </div>
                <div class="col-md-4">
                    <!-- Search Input -->
                    <input class="form-control form-control-sm" data-lb-fetch="/tasks" data-lb-target="#tasksTable" data-lb="search" name="search" placeholder="Search tasks" type="search">
                </div>
                <div class="col-md-4 d-flex justify-content-end gap-2">
                    <!-- Refresh Button -->
                    <button class="btn btn-sm btn-secondary" data-lb-fetch="/tasks?status=all" data-lb-target="#tasksTable" data-lb="button">Refresh</button>
                </div>
            </div>
        </div>
        <div class="card-body">
            <!-- HTML Controller Root -->
            <div data-lb="html" data-lb-fetch="/tasks?status=all" data-lb-interval="100s" data-lb-target="#tasksTable" id="tasksTable"></div>
        </div>
        <div class="card-footer">
        </div>
    </div>
</div>

@endsection

@section('scripts')
<script src="{{ asset('dist/liveblade.js') }}"></script>
@endsection