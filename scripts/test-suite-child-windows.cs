using System;
using System.Text;
using System.IO;
using System.Threading;
using System.Diagnostics;
using System.ComponentModel;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;

public static class TestSuiteChildWindows {
  public static int Main(string[] args) { return Run(args[0]); }
  public class Request {
    public string command, cwd, logFile, proofFile, attemptId, reservationToken, launchNonce;
    public string[] args;
    public int timeoutMs,startupMs;
  }
  static readonly JavaScriptSerializer json = new JavaScriptSerializer();
  static Request request;
  static Dictionary<string,object> helper;
  static Dictionary<string,object> root;
  static string startedAt;
  static string launchError;
  static string Now() { return DateTime.UtcNow.ToString("o"); }
  static Dictionary<string,object> Identity(int pid,IntPtr handle) {
    long created,exited,kernel,user;
    Check(GetProcessTimes(handle,out created,out exited,out kernel,out user),"GetProcessTimes");
    return new Dictionary<string,object>{{"pid",pid},{"start",DateTime.FromFileTimeUtc(created).Ticks.ToString()}};
  }
  static void Proof(string status,object exit,bool timedOut,string observation,bool interrupted) {
    var value=new Dictionary<string,object>{{"version",1},{"attemptId",request.attemptId},{"reservationToken",request.reservationToken},
      {"launchNonce",request.launchNonce},{"helper",helper},{"root",root},{"exit",exit},{"signal",null},{"status",status},
      {"timedOut",timedOut},{"interrupted",interrupted},{"startedAt",startedAt},{"finishedAt",Now()},{"communicationError",communicationFailure},{"launchError",launchError},
      {"tree",new Dictionary<string,object>{{"mechanism","windows-job"},{"empty",true},{"observation",observation},{"activeProcesses",0},{"observedAt",Now()}}}};
    string temporary=Path.Combine(Path.GetDirectoryName(request.proofFile),"tree-proof-"+Guid.NewGuid().ToString()+".tmp");
    byte[] bytes=new UTF8Encoding(false).GetBytes(json.Serialize(value)+"\n");
    using(var file=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)){file.Write(bytes,0,bytes.Length);file.Flush(true);}
    File.Move(temporary,request.proofFile); // never overwrite another proof
  }
  [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES { public int length; public IntPtr descriptor; public int inherit; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO { public int cb; public string reserved, desktop, title; public int x,y,xSize,ySize,xCount,yCount,fill,flags; public short show,reserved2; public IntPtr reservedPtr,stdin,stdout,stderr; }
  [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO startup; public IntPtr attributes; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process,thread; public int pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT { public long processTime,jobTime; public uint flags; public UIntPtr minWorking,maxWorking; public uint activeLimit; public UIntPtr affinity; public uint priority,scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT { public BASIC_LIMIT basic; public IO_COUNTERS io; public UIntPtr processMemory,jobMemory,peakProcessMemory,peakJobMemory; }
  [StructLayout(LayoutKind.Sequential)] struct ACCOUNTING { public long user,kernel,periodUser,periodKernel; public uint faults,total,active,terminated; }
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,ref EXTENDED_LIMIT limit,int size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int type,out ACCOUNTING value,int size,IntPtr length);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref UIntPtr size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,UIntPtr attribute,IntPtr value,UIntPtr size,IntPtr previous,IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string cwd,ref STARTUPINFOEX startup,out PROCESS_INFORMATION process);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateFile(string name,uint access,uint share,ref SECURITY_ATTRIBUTES attributes,uint disposition,uint flags,IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint exit);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out long created,out long exited,out long kernel,out long user);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static volatile bool disconnected;
  static string communicationFailure;
  static void Check(bool okay,string operation) { if(!okay)throw new Win32Exception(Marshal.GetLastWin32Error(),operation); }
  public static string Quote(string argument) {
    var text=new StringBuilder("\""); int slashes=0;
    foreach(char ch in argument) {
      if(ch=='\\') { slashes++; continue; }
      if(ch=='\"')text.Append('\\',slashes*2+1);
      else text.Append('\\',slashes);
      text.Append(ch); slashes=0;
    }
    return text.Append('\\',slashes*2).Append('"').ToString();
  }
  static void Event(string value) {
    try {
      var row=json.Deserialize<Dictionary<string,object>>(value);
      row["attemptId"]=request.attemptId;row["launchNonce"]=request.launchNonce;
      if((string)row["event"]=="ready"){row["helper"]=helper;row["mechanism"]="windows-job";}
      if((string)row["event"]=="started"){row["root"]=root;row["startedAt"]=startedAt;}
      Console.WriteLine(json.Serialize(row)); Console.Out.Flush();
    }
    catch(Exception error) { communicationFailure=error.Message; disconnected=true; }
  }
  public static int Run(string configuration) {
    var admission=Stopwatch.StartNew();
    request=json.Deserialize<Request>(File.ReadAllText(configuration));
    helper=Identity(Process.GetCurrentProcess().Id,Process.GetCurrentProcess().Handle);
    string executable=request.command,cwd=request.cwd,log=request.logFile,token=request.launchNonce;
    string[] args=request.args;int timeoutMs=request.timeoutMs;
    IntPtr job=IntPtr.Zero,list=IntPtr.Zero,jobValue=IntPtr.Zero,handles=IntPtr.Zero,output=IntPtr.Zero,input=IntPtr.Zero;
    PROCESS_INFORMATION process=new PROCESS_INFORMATION(); bool initialized=false,started=false;
    try {
      job=CreateJobObject(IntPtr.Zero,null); Check(job!=IntPtr.Zero,"CreateJobObject");
      var limits=new EXTENDED_LIMIT(); limits.basic.flags=0x2000; // kill on close; no breakaway
      Check(SetInformationJobObject(job,9,ref limits,Marshal.SizeOf(limits)),"SetInformationJobObject");
      UIntPtr size=UIntPtr.Zero;
      InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);
      if(size==UIntPtr.Zero)throw new Exception("Attribute list unavailable");
      list=Marshal.AllocHGlobal((int)size.ToUInt64());
      Check(InitializeProcThreadAttributeList(list,2,0,ref size),"InitializeProcThreadAttributeList"); initialized=true;
      jobValue=Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobValue,job);
      Check(UpdateProcThreadAttribute(list,0,new UIntPtr(0x2000d),jobValue,new UIntPtr((uint)IntPtr.Size),IntPtr.Zero,IntPtr.Zero),"JOB_LIST");
      var security=new SECURITY_ATTRIBUTES(); security.length=Marshal.SizeOf(security); security.inherit=1;
      output=CreateFile(log,0x40000000,3,ref security,1,0x80,IntPtr.Zero); Check(output!=new IntPtr(-1),"Create output");
      input=CreateFile("NUL",0x80000000,3,ref security,3,0x80,IntPtr.Zero); Check(input!=new IntPtr(-1),"Create input");
      handles=Marshal.AllocHGlobal(IntPtr.Size*2); Marshal.WriteIntPtr(handles,output); Marshal.WriteIntPtr(handles,IntPtr.Size,input);
      Check(UpdateProcThreadAttribute(list,0,new UIntPtr(0x20002),handles,new UIntPtr((uint)(IntPtr.Size*2)),IntPtr.Zero,IntPtr.Zero),"HANDLE_LIST");
      Event("{\"event\":\"ready\",\"token\":\""+token+"\"}");
      string authorization=null;
      var authorizationRead=new ManualResetEvent(false);
      var reader=new Thread(()=>{
        try { authorization=Console.ReadLine(); }
        catch(Exception error) { communicationFailure=error.Message; disconnected=true; }
        finally { authorizationRead.Set(); }
      });
      reader.IsBackground=true; reader.Start();
      int remaining=(int)Math.Max(0,Math.Min(60000,request.startupMs)-admission.ElapsedMilliseconds);
      if(!authorizationRead.WaitOne(remaining)||authorization!=token||disconnected) {
        Proof("not-run",null,false,"no-launch",disconnected); Event("{\"event\":\"finished\",\"status\":\"not-run\"}"); return 75;
      }
      var startup=new STARTUPINFOEX(); startup.startup.cb=Marshal.SizeOf(startup); startup.attributes=list;
      startup.startup.flags=0x101; startup.startup.show=0; startup.startup.stdin=input; startup.startup.stdout=output; startup.startup.stderr=output;
      var command=new StringBuilder(Quote(executable)); foreach(string arg in args)command.Append(' ').Append(Quote(arg));
      startedAt=Now();
      var elapsed=Stopwatch.StartNew();
      Check(CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,true,0x08080000,IntPtr.Zero,cwd,ref startup,out process),"CreateProcess inside Job");
      started=true;
      root=Identity(process.pid,process.process);
      Event("{\"event\":\"started\"}");
      var watcher=new Thread(()=>{try { while(Console.ReadLine()!=null) {} } catch(Exception error) { communicationFailure=error.Message; } finally { disconnected=true; }}); watcher.IsBackground=true; watcher.Start();
      bool timedOut=false,stopping=false,rootDone=false; uint exitCode=259; long cleanupDeadline=0;
      for(;;) {
        ACCOUNTING accounting; Check(QueryInformationJobObject(job,1,out accounting,Marshal.SizeOf(typeof(ACCOUNTING)),IntPtr.Zero),"Query Job accounting");
        uint wait=WaitForSingleObject(process.process,0); if(wait==0xffffffff)throw new Win32Exception();
        if(wait==0&&!rootDone) { Check(GetExitCodeProcess(process.process,out exitCode),"Get root outcome"); rootDone=true; Event("{\"event\":\"root-exit\",\"exit\":"+exitCode+",\"active\":"+accounting.active+"}"); }
        if(accounting.active==0&&rootDone) {
          bool interrupted=disconnected;
          string status=timedOut?"timed-out":interrupted?"interrupted":"exited";
          int terminalExit=timedOut?124:interrupted?125:exitCode==0?0:1;
          Proof(status,exitCode,timedOut,"active-processes-zero",interrupted);
          Event("{\"event\":\"finished\",\"status\":\""+status+"\"}");
          return terminalExit;
        }
        if(!stopping&&(elapsed.ElapsedMilliseconds>=timeoutMs||disconnected)) {
          timedOut=!disconnected; Check(TerminateJobObject(job,timedOut?124u:125u),"Terminate owned Job"); stopping=true;
          cleanupDeadline=elapsed.ElapsedMilliseconds+10000;
          Event("{\"event\":\"stopping\",\"timedOut\":"+(timedOut?"true":"false")+"}");
        }
        // The parent treats any missing proof as unknown, even when handle close kills descendants.
        if(stopping&&elapsed.ElapsedMilliseconds>cleanupDeadline)throw new Exception("Job exit unconfirmed");
        Thread.Sleep(20);
      }
    } catch(Exception error) {
      try { Console.Error.WriteLine(error.ToString()); } catch { disconnected=true; }
      if(!started) {
        launchError=error.Message;
        try {
          ACCOUNTING accounting;
          if(job==IntPtr.Zero||(QueryInformationJobObject(job,1,out accounting,Marshal.SizeOf(typeof(ACCOUNTING)),IntPtr.Zero)&&accounting.active==0)) {
            Proof("not-run",null,false,"no-launch",disconnected); Event("{\"event\":\"finished\",\"status\":\"not-run\"}"); return 75;
          }
        } catch { /* missing proof remains unknown */ }
      }
      Event("{\"event\":\"unknown\",\"started\":"+(started?"true":"false")+"}"); return 1;
    } finally {
      if(process.thread!=IntPtr.Zero)CloseHandle(process.thread); if(process.process!=IntPtr.Zero)CloseHandle(process.process);
      if(job!=IntPtr.Zero)CloseHandle(job);
      if(output!=IntPtr.Zero&&output!=new IntPtr(-1))CloseHandle(output); if(input!=IntPtr.Zero&&input!=new IntPtr(-1))CloseHandle(input);
      if(initialized)DeleteProcThreadAttributeList(list); if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list);
      if(jobValue!=IntPtr.Zero)Marshal.FreeHGlobal(jobValue); if(handles!=IntPtr.Zero)Marshal.FreeHGlobal(handles);
    }
  }
}
