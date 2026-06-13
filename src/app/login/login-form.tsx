"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Lock, User } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputWithIcon } from "@/components/ui/input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
  rememberMe: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const [pending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "", rememberMe: true },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const { error } = await authClient.signIn.username({
        username: values.username.trim(),
        password: values.password,
        rememberMe: values.rememberMe,
      });
      if (error) {
        toast.error(error.message ?? "用户名或密码错误");
        return;
      }
      window.location.assign("/");
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>用户名</FormLabel>
              <InputWithIcon
                icon={<User />}
                placeholder="请输入用户名"
                autoComplete="username"
                autoFocus
                {...field}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>密码</FormLabel>
              <InputWithIcon
                icon={<Lock />}
                type="password"
                placeholder="请输入密码"
                autoComplete="current-password"
                {...field}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="rememberMe"
          render={({ field }) => (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <span>30 天内免登录</span>
            </label>
          )}
        />
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? "登录中" : "立即登录"}
        </Button>
      </form>
    </Form>
  );
}
