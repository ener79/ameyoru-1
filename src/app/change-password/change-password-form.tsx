"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { changeOwnPasswordAction } from "@/server/actions/me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const schema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z
      .string()
      .min(9, "密码必须超过 8 位")
      .regex(/(?=.*[a-z])(?=.*[A-Z])/, "密码必须包含大小写字母"),
    confirm: z.string().min(1, "请确认新密码"),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: "两次输入不一致",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [pending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const res = await changeOwnPasswordAction({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      if (!res.ok) {
        toast.error(res.error ?? "改密失败");
        return;
      }
      toast.success("密码已更新");
      window.location.assign("/");
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>当前密码</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>新密码</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>确认新密码</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={pending} size="lg">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? "提交中" : forced ? "设置新密码并继续" : "确认修改"}
        </Button>
      </form>
    </Form>
  );
}
