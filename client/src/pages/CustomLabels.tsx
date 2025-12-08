import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardHeader from "@/components/common/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Edit2, Trash2, Tags } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

interface CustomLabel {
  id: number;
  userId: number;
  name: string;
  color: string;
  createdAt: string;
}

const labelSchema = z.object({
  name: z.string().min(1, "Label name is required").max(50, "Label name must be 50 characters or less"),
  color: z.string().min(1, "Color is required"),
});

type LabelFormData = z.infer<typeof labelSchema>;

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#64748b"
];

export default function CustomLabels() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<CustomLabel | null>(null);
  const [deletingLabel, setDeletingLabel] = useState<CustomLabel | null>(null);

  // Fetch custom labels
  const { data: labels = [], isLoading } = useQuery<CustomLabel[]>({
    queryKey: ['/api/custom-labels'],
    staleTime: 60000,
  });

  const form = useForm<LabelFormData>({
    resolver: zodResolver(labelSchema),
    defaultValues: {
      name: "",
      color: PRESET_COLORS[0],
    },
  });

  // Create label mutation
  const createLabelMutation = useMutation({
    mutationFn: (data: LabelFormData) => 
      apiRequest('/api/custom-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-labels'] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Label created",
        description: "Your custom label has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error creating label",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Update label mutation
  const updateLabelMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: LabelFormData }) =>
      apiRequest(`/api/custom-labels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-labels'] });
      setEditingLabel(null);
      form.reset();
      toast({
        title: "Label updated",
        description: "Your custom label has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error updating label",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Delete label mutation
  const deleteLabelMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/custom-labels/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-labels'] });
      setDeletingLabel(null);
      toast({
        title: "Label deleted",
        description: "Your custom label has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting label",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LabelFormData) => {
    if (editingLabel) {
      updateLabelMutation.mutate({ id: editingLabel.id, data });
    } else {
      createLabelMutation.mutate(data);
    }
  };

  const handleEdit = (label: CustomLabel) => {
    setEditingLabel(label);
    form.setValue("name", label.name);
    form.setValue("color", label.color);
  };

  const handleCreateNew = () => {
    setEditingLabel(null);
    form.reset();
    setIsCreateDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsCreateDialogOpen(false);
    setEditingLabel(null);
    form.reset();
  };

  return (
    <>
      <DashboardHeader 
        title="Custom Labels" 
        subtitle="Create and manage content labels for better organization" 
        importLabel="Create Label"
        onImportClick={handleCreateNew}
      />
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6">
          {/* Overview Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tags className="w-5 h-5" />
                Label Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{labels.length}</div>
                  <div className="text-sm text-gray-600">Total Labels</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{labels.filter(l => l.color).length}</div>
                  <div className="text-sm text-gray-600">Colored Labels</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">0</div>
                  <div className="text-sm text-gray-600">Posts Tagged</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Labels Management */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Your Labels</CardTitle>
              <Button onClick={handleCreateNew} className="gap-2">
                <Plus className="w-4 h-4" />
                Create Label
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-gray-500">Loading labels...</div>
                </div>
              ) : labels.length === 0 ? (
                <div className="text-center py-12">
                  <Tags className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No labels yet</h3>
                  <p className="text-gray-500 mb-4">
                    Create your first custom label to start organizing your content.
                  </p>
                  <Button onClick={handleCreateNew} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Create Your First Label
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {labels.map((label) => (
                    <div key={label.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <Badge 
                          style={{ backgroundColor: label.color }} 
                          className="h-6 w-6 rounded-full p-0 flex-shrink-0" 
                        />
                        <div>
                          <div className="font-medium">{label.name}</div>
                          <div className="text-sm text-gray-500">
                            ID: {label.id} • Created {new Date(label.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(label)}
                          className="gap-2"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingLabel(label)}
                          className="gap-2 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Create/Edit Label Dialog */}
        <Dialog open={isCreateDialogOpen || !!editingLabel} onOpenChange={handleCloseDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingLabel ? 'Edit Label' : 'Create New Label'}</DialogTitle>
              <DialogDescription>
                {editingLabel ? 'Update your custom label details.' : 'Create a new custom label for organizing your content.'}
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Label Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter label name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color</FormLabel>
                      <FormControl>
                        <div className="space-y-3">
                          <div className="grid grid-cols-9 gap-2">
                            {PRESET_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                className={`w-8 h-8 rounded-full border-2 ${
                                  field.value === color ? 'border-gray-900' : 'border-gray-200'
                                }`}
                                style={{ backgroundColor: color }}
                                onClick={() => field.onChange(color)}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Custom:</span>
                            <input
                              type="color"
                              value={field.value}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="w-10 h-8 border border-gray-200 rounded cursor-pointer"
                            />
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createLabelMutation.isPending || updateLabelMutation.isPending}
                  >
                    {editingLabel ? 'Update Label' : 'Create Label'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingLabel} onOpenChange={() => setDeletingLabel(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Label</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the label "{deletingLabel?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingLabel && deleteLabelMutation.mutate(deletingLabel.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
