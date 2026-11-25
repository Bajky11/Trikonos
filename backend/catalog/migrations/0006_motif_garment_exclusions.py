from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('catalog', '0005_shared_garment_offer')]
    operations = [
        migrations.AddField(
            model_name='motif', name='garment_exclusions',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
