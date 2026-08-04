"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { FileText, Upload, Download } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { EmployeeDocument } from "@/types";

export default function DocumentsPage() {
  const { tenant, role } = useTenant();
  const { user } = useAuth();
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!tenant) return;
    loadDocuments();
  }, [tenant]);

  const loadDocuments = async () => {
    let query = supabase
      .from("employee_documents")
      .select("*, employee:employees(profile:profiles(full_name))")
      .eq("tenant_id", tenant!.id);

    if (role === "employee" && user) {
      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("profile_id", user.id)
        .single();
      if (empData) query = query.eq("employee_id", empData.id);
    }

    const { data } = await query.order("created_at", { ascending: false });
    setDocuments(data || []);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !tenant) return;
    setIsUploading(true);
    const file = e.target.files[0];
    const path = `${tenant.id}/${crypto.randomUUID()}_${file.name}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("documents")
      .upload(path, file);

    if (uploadError) {
      alert(uploadError.message);
      setIsUploading(false);
      return;
    }

    const { data: empData } = await supabase
      .from("employees")
      .select("id")
      .eq("profile_id", user!.id)
      .single();

    await supabase.from("employee_documents").insert({
      tenant_id: tenant.id,
      employee_id: empData!.id,
      document_type: "other",
      file_name: file.name,
      file_url: uploadData.path,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: user!.id,
    });

    loadDocuments();
    setIsUploading(false);
  };

  const handleDownload = async (doc: EmployeeDocument) => {
    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_url, 60);
    if (data) window.open(data.signedUrl, "_blank");
  };

  const isEmployee = role === "employee";

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <h1 className="section-title">Documents</h1>
        {isEmployee && (
          <label className="btn-primary cursor-pointer">
            <Upload className="h-4 w-4 mr-2" />
            {isUploading ? "Uploading..." : "Upload"}
            <input type="file" className="hidden" onChange={handleUpload} />
          </label>
        )}
      </div>

      {documents.length === 0 ? (
        <div className="card empty-state py-16">
          <div className="empty-state-icon">
            <FileText className="h-6 w-6" />
          </div>
          <p className="text-[var(--foreground-muted)]">
            {isEmployee ? "You have not uploaded any documents yet" : "No documents in this tenant"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div key={doc.id} className="card group">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--accent)]/10 shrink-0">
                  <FileText className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{doc.file_name}</p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5 capitalize">
                    {doc.document_type} · {(doc.employee as any)?.profile?.full_name || "You"}
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {formatDate(doc.created_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDownload(doc)}
                className="mt-4 flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
