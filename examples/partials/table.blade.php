<!-- partial table -->
<table class="table-striped table-bordered table">
    <thead>
        <th data-lb-sort="subject">Subject</th>
        <th data-lb-sort="priority">Priority</th>
        <th data-lb-sort="due_date">Due Date</th>
    </thead>
    <tbody>
        @foreach ($tasks as $task)
            <tr>
                <td>{{ $task->subject }}</td>
                <td>{{ $task->priority }}</td>
                <td>{{ $task->due_date }}</td>
            </tr>
        @endforeach
    </tbody>
</table>

@if ($tasks->hasPages())
    <div class="row mx-2 mt-2">
        <div class="col-md-6">
            {{ $tasks->total() }} tasks found
        </div>
        <div class="col-md-6 d-flex justify-content-end">
            <!-- Pagination — THIS WORKS NOW -->
            <div data-lb-target="#tasksTable" data-lb="pagination">
                {!! $tasks->withQueryString()->links() !!}
            </div>
        </div>
    </div>
@endif
