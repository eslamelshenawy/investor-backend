/**
 * Notification Helper - إرسال الإشعارات
 */

import { prisma } from '../services/database.js';
import { logger } from './logger.js';

interface NotifyParams {
  userId: string;
  type: string;
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  data?: Record<string, any>;
}

export async function notify(params: NotifyParams): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        titleAr: params.titleAr,
        message: params.message,
        messageAr: params.messageAr,
        data: params.data ? JSON.stringify(params.data) : '{}',
      },
    });
  } catch (err) {
    logger.error('Failed to create notification', err);
  }
}

export async function notifyContentApproved(userId: string, contentTitle: string, contentId: string): Promise<void> {
  await notify({
    userId,
    type: 'content',
    title: 'Content Approved',
    titleAr: 'تمت الموافقة على المحتوى',
    message: `Your content "${contentTitle}" has been approved`,
    messageAr: `تمت الموافقة على محتواك "${contentTitle}"`,
    data: { contentId },
  });
}

export async function notifyContentRejected(userId: string, contentTitle: string, contentId: string, reason?: string): Promise<void> {
  await notify({
    userId,
    type: 'content',
    title: 'Content Rejected',
    titleAr: 'تم رفض المحتوى',
    message: `Your content "${contentTitle}" was rejected${reason ? `: ${reason}` : ''}`,
    messageAr: `تم رفض محتواك "${contentTitle}"${reason ? `: ${reason}` : ''}`,
    data: { contentId, reason },
  });
}

export async function notifyNewLike(userId: string, likerName: string, contentTitle: string, contentId: string): Promise<void> {
  await notify({
    userId,
    type: 'like',
    title: 'New Like',
    titleAr: 'إعجاب جديد',
    message: `${likerName} liked your content "${contentTitle}"`,
    messageAr: `أعجب ${likerName} بمحتواك "${contentTitle}"`,
    data: { contentId },
  });
}

export async function notifyNewComment(userId: string, commenterName: string, contentTitle: string, contentId: string): Promise<void> {
  await notify({
    userId,
    type: 'comment',
    title: 'New Comment',
    titleAr: 'تعليق جديد',
    message: `${commenterName} commented on "${contentTitle}"`,
    messageAr: `علّق ${commenterName} على "${contentTitle}"`,
    data: { contentId },
  });
}

export async function notifyNewFollower(userId: string, followerName: string): Promise<void> {
  await notify({
    userId,
    type: 'follow',
    title: 'New Follower',
    titleAr: 'متابع جديد',
    message: `${followerName} started following you`,
    messageAr: `بدأ ${followerName} بمتابعتك`,
    data: {},
  });
}
