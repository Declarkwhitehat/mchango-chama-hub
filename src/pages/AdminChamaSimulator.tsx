import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, FlaskConical, Play, RotateCcw, Download, CheckCircle2, XCircle, MinusCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface StageResult {
  stage: number;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  expected: string;
  actual: string;
  details?: unknown;
  error?: string;
}

interface SimulationRun {
  id: string;
  status: string;
  total_tests: number;
  passed: number;
  failed: number;
  current_stage: string | null;
  started_at: string;
  finished_at: string | null;
  report: { stages?: StageResult[]; payoutOrder?: Array<Record<string, unknown>>; error?: string };
}

const TOTAL_STAGES = 10;

export default function AdminChamaSimulator() {
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const stages = run?.report?.stages ?? [];
  const completedStages = stages.filter(s => s.stage > 0).length;
  const isRunning = run?.status === 'running';

  async function startRun() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('chama-simulator', {
        body: { action: 'start' },
      });
      if (error) throw error;
      const runId = data?.run_id;
      if (!runId) throw new Error('No run_id returned');

      // Initial fetch
      await pollOnce(runId);
      // Poll
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(() => pollOnce(runId), 2000);
      toast.success('Simulation started');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to start: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function pollOnce(runId: string) {
    const { data, error } = await supabase.functions.invoke('chama-simulator', {
      body: { action: 'status', run_id: runId },
    });
    if (error) return;
    setRun(data as SimulationRun);
    if (data?.status !== 'running' && pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function resetData() {
    if (!confirm('Delete ALL simulator-created test data (chamas, members, auth users)? Real user data is untouched.')) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('chama-simulator', {
        body: { action: 'reset' },
      });
      if (error) throw error;
      toast.success(`Purged ${data?.purged?.chamas_purged ?? 0} chamas, ${data?.purged?.users_purged ?? 0} users`);
      setRun(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Reset failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  function downloadPdf() {
    if (!run) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Chama Simulator Report', 14, 18);
    doc.setFontSize(10);
    doc.text(`Run: ${run.id}`, 14, 26);
    doc.text(`Started: ${new Date(run.started_at).toLocaleString()}`, 14, 32);
    doc.text(`Status: ${run.status.toUpperCase()}  •  Total: ${run.total_tests}  •  Passed: ${run.passed}  •  Failed: ${run.failed}`, 14, 38);

    autoTable(doc, {
      startY: 46,
      head: [['#', 'Stage', 'Status', 'Expected', 'Actual']],
      body: stages.map(s => [
        s.stage,
        s.name,
        s.status.toUpperCase(),
        s.expected,
        s.actual + (s.error ? `\nERROR: ${s.error}` : ''),
      ]),
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [60, 60, 80] },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 35 }, 2: { cellWidth: 16 }, 3: { cellWidth: 60 }, 4: { cellWidth: 70 } },
    });

    if (run.report?.payoutOrder?.length) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Final Payout Order (Stage 8)', 14, 18);
      autoTable(doc, {
        startY: 24,
        head: [['#', 'Member', 'Success Rate', 'Payout Default', 'Position']],
        body: run.report.payoutOrder.map((m, i) => [
          i + 1,
          String(m.name ?? ''),
          String(m.success_rate ?? ''),
          m.has_payout_default ? 'YES' : 'no',
          String(m.position ?? i + 1),
        ]),
        styles: { fontSize: 9 },
      });
    }

    doc.save(`chama-simulation-${run.id.slice(0, 8)}.pdf`);
  }

  const statusBadge = (s: StageResult['status']) => {
    if (s === 'pass') return <Badge className="bg-emerald-600 hover:bg-emerald-600">PASS</Badge>;
    if (s === 'fail') return <Badge variant="destructive">FAIL</Badge>;
    return <Badge variant="secondary">SKIP</Badge>;
  };

  const failures = stages.filter(s => s.status === 'fail');

  return (
    <>
      
      <div className="container max-w-6xl py-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" />
              Chama Simulator
            </h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
              Runs the full chama lifecycle end-to-end against the live database using isolated test
              accounts (phone prefix <code>000</code>, no real SMS sent). Verifies success-rate ordering,
              freeze rules, defining-cycle removal, restart window, and the <code>has_payout_default</code> flag.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={startRun} disabled={busy || isRunning}>
              <Play className="h-4 w-4 mr-2" />
              {isRunning ? 'Running…' : 'Run Simulation'}
            </Button>
            <Button variant="outline" onClick={resetData} disabled={busy || isRunning}>
              <RotateCcw className="h-4 w-4 mr-2" /> Reset Data
            </Button>
            <Button variant="outline" onClick={downloadPdf} disabled={!run || isRunning}>
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </Button>
          </div>
        </div>

        {!run && (
          <Card>
            <CardHeader>
              <CardTitle>No run yet</CardTitle>
              <CardDescription>Click <strong>Run Simulation</strong> to start a fresh end-to-end test.</CardDescription>
            </CardHeader>
          </Card>
        )}

        {run && (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      Run #{run.id.slice(0, 8)}
                      <Badge variant={run.status === 'completed' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'} className="ml-2 align-middle">
                        {run.status.toUpperCase()}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Started {new Date(run.started_at).toLocaleString()}
                      {run.current_stage && ` • Current: ${run.current_stage}`}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold">
                      <span className="text-emerald-600">{run.passed}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-destructive">{run.failed}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">passed / failed of {run.total_tests}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Progress value={(completedStages / TOTAL_STAGES) * 100} />
                <div className="text-xs text-muted-foreground mt-2">{completedStages} of {TOTAL_STAGES} stages</div>
              </CardContent>
            </Card>

            {run.report?.error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Runner crashed</AlertTitle>
                <AlertDescription className="font-mono text-xs">{run.report.error}</AlertDescription>
              </Alert>
            )}

            {failures.length > 0 && (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="text-destructive flex items-center gap-2">
                    <XCircle className="h-5 w-5" /> Recommendations ({failures.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {failures.map(f => (
                      <li key={f.stage} className="border-l-2 border-destructive pl-3">
                        <div className="font-semibold">Stage {f.stage}: {f.name}</div>
                        <div className="text-muted-foreground"><strong>Expected:</strong> {f.expected}</div>
                        <div className="text-muted-foreground"><strong>Got:</strong> {f.actual}</div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              {stages.map(s => (
                <Collapsible key={`${s.stage}-${s.name}`}>
                  <Card className={s.status === 'fail' ? 'border-destructive' : s.status === 'pass' ? 'border-emerald-500/30' : ''}>
                    <CollapsibleTrigger className="w-full text-left">
                      <CardHeader className="py-3">
                        <div className="flex items-center gap-3">
                          {s.status === 'pass' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> :
                           s.status === 'fail' ? <XCircle className="h-5 w-5 text-destructive" /> :
                           <MinusCircle className="h-5 w-5 text-muted-foreground" />}
                          <div className="flex-1">
                            <CardTitle className="text-base flex items-center gap-2">
                              <span className="text-muted-foreground text-sm">Stage {s.stage}</span>
                              {s.name}
                              {statusBadge(s.status)}
                            </CardTitle>
                          </div>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-2 text-sm">
                        <div><strong>Expected:</strong> {s.expected}</div>
                        <div><strong>Actual:</strong> {s.actual}</div>
                        {s.error && <div className="text-destructive font-mono text-xs"><strong>Error:</strong> {s.error}</div>}
                        {!!s.details && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground">Raw details</summary>
                            <pre className="mt-1 bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(s.details, null, 2)}</pre>
                          </details>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>

            {run.report?.payoutOrder?.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>Final Payout Order (Stage 8)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Success Rate</TableHead>
                        <TableHead>Payout Default</TableHead>
                        <TableHead>Position</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {run.report.payoutOrder.map((m, i) => (
                        <TableRow key={i}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>{String(m.name ?? '')}</TableCell>
                          <TableCell>{String(m.success_rate ?? '')}</TableCell>
                          <TableCell>{m.has_payout_default ? <Badge variant="destructive">YES</Badge> : 'no'}</TableCell>
                          <TableCell>{String(m.position ?? i + 1)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
