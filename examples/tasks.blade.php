@extends('layouts.app')
@section('content')

<!-- KPIs -->
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

<!-- Tasks Listing -->
<div class="container">

    <div class="card">
        <div class="card-header">
            <div class="row g-2">
                <div class="col-md-4">
                    <h5>Tasks</h5>
                </div>
                <div class="col-md-4">
                    <input class="form-control form-control-sm" data-lb-fetch="/test/tasks" data-lb-target="#tasksTable" data-lb="search" name="search" placeholder="Search tasks" type="search">
                </div>
                <div class="col-md-4 d-flex justify-content-end gap-2">
                    <button class="btn btn-sm btn-secondary" data-lb-fetch="/test/tasks?all" data-lb-target="#tasksTable" data-lb="button">Refresh</button>
                </div>
            </div>
        </div>
        <div class="card-body">
            <div data-lb="html" data-lb-fetch="/tasks" data-lb-interval="100s" data-lb-target="#tasksTable" id="tasksTable"></div>
        </div>
        <div class="card-footer">
            
        </div>
    </div>
</div>

@endsection

@section('scripts')
<script src="{{ asset('dist/liveblade.js') }}"></script>
@endsection