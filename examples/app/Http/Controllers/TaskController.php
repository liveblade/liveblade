<?php

namespace App\Http\Controllers\Test;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

use App\Task;
use App\Helpers\MinifyHtml;

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
                'success' => true,
                'message' => 'Data loaded successfully',
                'html' => MinifyHtml::minify(
                    view('liveblade.partials.table')
                        ->with('tasks', $tasks)
                        ->render()
                ),
                'has_more' => $tasks->hasMorePages(),
            ]);
        }
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
