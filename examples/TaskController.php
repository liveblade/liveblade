<?php

namespace App\Http\Controllers\Test;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Task;
use App\User;

class TestTaskController extends Controller
{


    public function __construct()
    {
        $this->middleware('auth');
    }

    public function index(Request $request)
    {
        if ($request->ajax()) {

            $tasks = Task::paginate(10);

            return response()->json([
                'html' => view('liveblade.partials.table', compact('tasks'))->render(),
                'has_more' => $tasks->hasMorePages(),
            ]);
        }

        return view('liveblade.tasks');
    }


    public function counts(Request $request)
    {
        $validated = $request->validate([
            'status' => 'required|in:not-started,in-progress,completed',
        ]);

        $status = $validated['status'];
        $value = Task::where('status', $status)->count();

        return response()->json([
            'data' =>  $value
        ]);
    }
}
