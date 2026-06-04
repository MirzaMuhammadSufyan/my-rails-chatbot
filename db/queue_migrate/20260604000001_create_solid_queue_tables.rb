class CreateSolidQueueTables < ActiveRecord::Migration[8.0]
  def change
    create_table :solid_queue_jobs do |t|
      t.string :queue_name, null: false
      t.string :class_name, null: false
      t.text :arguments
      t.integer :priority, default: 0, null: false
      t.string :active_job_id
      t.datetime :scheduled_at
      t.datetime :finished_at
      t.string :concurrency_key
      t.timestamps
    end
    add_index :solid_queue_jobs, :active_job_id
    add_index :solid_queue_jobs, :class_name
    add_index :solid_queue_jobs, :finished_at
    add_index :solid_queue_jobs, %i[queue_name finished_at], name: "index_solid_queue_jobs_for_filtering"
    add_index :solid_queue_jobs, %i[scheduled_at finished_at], name: "index_solid_queue_jobs_for_alerting"

    create_table :solid_queue_blocked_executions do |t|
      t.references :job, null: false, index: { unique: true }, foreign_key: { to_table: :solid_queue_jobs, on_delete: :cascade }
      t.string :queue_name, null: false
      t.integer :priority, default: 0, null: false
      t.string :concurrency_key, null: false
      t.datetime :expires_at, null: false
      t.datetime :created_at, null: false
    end
    add_index :solid_queue_blocked_executions, %i[concurrency_key priority job_id], name: "index_solid_queue_blocked_executions_for_release"
    add_index :solid_queue_blocked_executions, %i[expires_at concurrency_key], name: "index_solid_queue_blocked_executions_for_maintenance"

    create_table :solid_queue_claimed_executions do |t|
      t.references :job, null: false, index: { unique: true }, foreign_key: { to_table: :solid_queue_jobs, on_delete: :cascade }
      t.bigint :process_id
      t.datetime :created_at, null: false
    end
    add_index :solid_queue_claimed_executions, %i[process_id job_id]

    create_table :solid_queue_failed_executions do |t|
      t.references :job, null: false, index: { unique: true }, foreign_key: { to_table: :solid_queue_jobs, on_delete: :cascade }
      t.text :error
      t.datetime :created_at, null: false
    end

    create_table :solid_queue_pauses do |t|
      t.string :queue_name, null: false, index: { unique: true }
      t.datetime :created_at, null: false
    end

    create_table :solid_queue_processes do |t|
      t.string :kind, null: false
      t.datetime :last_heartbeat_at, null: false, index: true
      t.bigint :supervisor_id, index: true
      t.integer :pid, null: false
      t.string :hostname
      t.text :metadata
      t.datetime :created_at, null: false
      t.string :name, null: false
    end
    add_index :solid_queue_processes, %i[name supervisor_id], unique: true

    create_table :solid_queue_ready_executions do |t|
      t.references :job, null: false, index: { unique: true }, foreign_key: { to_table: :solid_queue_jobs, on_delete: :cascade }
      t.string :queue_name, null: false
      t.integer :priority, default: 0, null: false
      t.datetime :created_at, null: false
    end
    add_index :solid_queue_ready_executions, %i[priority job_id], name: "index_solid_queue_poll_all"
    add_index :solid_queue_ready_executions, %i[queue_name priority job_id], name: "index_solid_queue_poll_by_queue"

    create_table :solid_queue_recurring_executions do |t|
      t.references :job, null: false, index: { unique: true }, foreign_key: { to_table: :solid_queue_jobs, on_delete: :cascade }
      t.string :task_key, null: false
      t.datetime :run_at, null: false
      t.datetime :created_at, null: false
    end
    add_index :solid_queue_recurring_executions, %i[task_key run_at], unique: true

    create_table :solid_queue_recurring_tasks do |t|
      t.string :key, null: false, index: { unique: true }
      t.string :schedule, null: false
      t.string :command, limit: 2048
      t.string :class_name
      t.text :arguments
      t.string :queue_name
      t.integer :priority, default: 0
      t.boolean :static, default: true, null: false, index: true
      t.text :description
      t.timestamps
    end

    create_table :solid_queue_scheduled_executions do |t|
      t.references :job, null: false, index: { unique: true }, foreign_key: { to_table: :solid_queue_jobs, on_delete: :cascade }
      t.string :queue_name, null: false
      t.integer :priority, default: 0, null: false
      t.datetime :scheduled_at, null: false
      t.datetime :created_at, null: false
    end
    add_index :solid_queue_scheduled_executions, %i[scheduled_at priority job_id], name: "index_solid_queue_dispatch_all"

    create_table :solid_queue_semaphores do |t|
      t.string :key, null: false, index: { unique: true }
      t.integer :value, default: 1, null: false
      t.datetime :expires_at, null: false, index: true
      t.timestamps
    end
    add_index :solid_queue_semaphores, %i[key value]
  end
end
