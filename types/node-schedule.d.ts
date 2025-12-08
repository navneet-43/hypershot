declare module 'node-schedule' {
  type DateLike = Date | string | number;
  type RecurrenceRule = any;
  type RecurrenceSpecDateRange = any;
  type RecurrenceSpecObjLit = any;
  
  interface JobCallback {
    (fireDate: Date): void;
  }
  
  interface Job {
    cancel(reschedule?: boolean): boolean;
    cancelNext(reschedule?: boolean): boolean;
    reschedule(spec: RecurrenceRule | RecurrenceSpecDateRange | RecurrenceSpecObjLit | DateLike): Job;
    nextInvocation(): Date;
  }
  
  function scheduleJob(rule: RecurrenceRule | RecurrenceSpecDateRange | RecurrenceSpecObjLit | DateLike, callback: JobCallback): Job;
  function cancelJob(job: Job): boolean;
  
  export = {
    scheduleJob,
    cancelJob,
    Job,
  };
}