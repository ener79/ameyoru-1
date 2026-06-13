"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { updateOwnProfileAction } from "@/server/actions/me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  name: z
    .string()
    .min(1, "请填写显示名")
    .max(32)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "显示名不能全为空格"),
  username: z
    .string()
    .min(2, "用户名至少 2 位")
    .max(32)
    .regex(/^[\p{L}\p{N}_.-]+$/u, "用户名只能中文/字母/数字/下划线/点/横线"),
});

type FormValues = z.infer<typeof schema>;

export function ProfileEditForm({
  initialName,
  initialUsername,
}: {
  initialName: string;
  initialUsername: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: initialName, username: initialUsername },
  });

  const unchanged =
    form.watch("name") === initialName &&
    form.watch("username") === initialUsername;

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const res = await updateOwnProfileAction(values);
      if (!res.ok) {
        toast.error(res.error ?? "修改失败");
        return;
      }
      toast.success("资料已更新");
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>显示名</FormLabel>
              <FormControl>
                <Input maxLength={32} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>用户名</FormLabel>
              <FormControl>
                <Input maxLength={32} {...field} />
              </FormControl>
              <FormDescription>
                用于登录,只能包含中文、字母、数字、下划线、点、横线
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={pending || unchanged}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Pencil />
          )}
          {pending ? "保存中" : "保存修改"}
        </Button>
      </form>
    </Form>
  );
}
